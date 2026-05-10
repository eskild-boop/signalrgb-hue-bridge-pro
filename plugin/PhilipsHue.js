export function Name() { return "Philips Hue"; }
export function Version() { return "2.0.0"; }
export function Type() { return "network"; }
export function Publisher() { return "WhirlwindFX"; }
export function Size() { return [3, 3]; }
export function DefaultPosition() {return [75, 70]; }
export function DefaultScale(){return 8.0;}
export function SubdeviceController(){ return true;}
/* global
controller:readonly
discovery: readonly
TakeActiveStream:readonly
disconnectColor:readonly
http:readonly
*/
export function ControllableParameters() {
	return [
		{"property":"TakeActiveStream", "group":"settings", "label":"Override active stream", "type":"boolean", "default":"false"},
		{"property":"disconnectColor", "group":"lighting", "label":"Disable Color", "type":"color", "default":"#ffca8b"},
	];
}

// ---- Device plugin module state ----
let CurrentArea = "";
let isStreamOpen = false;
let isStreamActive = false;
let isDtlsConnectionAlive = false;
let streamSequence = 0;

// Track the last time StartStream was attempted to prevent spamming on failure
let lastStreamAttempt = 0;
const STREAM_RETRY_INTERVAL = 5000;

export function Initialize() {
	device.addFeature("http");
	device.addFeature("dtls");
	http.ignoreSslErrors(true);
	dtls.ignoreSslErrors(true);

	if(controller.name){
		device.setName(controller.name);
	}

	if(controller.selectedArea && controller.areas && controller.areas[controller.selectedArea]){
		createLightsForArea(controller.selectedArea);
		// Active-stream takeover logic in dev branch crashes (dtls.send called before DTLS connection exists).
		// Skip the takeover dance; Render() will call StartStream + dtls.createConnection cleanly on first tick.
		device.log(`Initialize complete for area ${controller.selectedArea}. Stream will start on next Render tick.`);
	}else{
		device.log(`Initialize: no valid area selected (selectedArea="${controller.selectedArea}").`);
	}
}

function GetAreaInfo(areaId){
	if(!areaId){
		return null;
	}

	const xhr = new XMLHttpRequest();
	xhr.open("GET", `http://127.0.0.1:18080/clip/v2/resource/entertainment_configuration/${areaId}`, false);
	xhr.setRequestHeader("Accept", "application/json");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("hue-application-key", controller.username);
	xhr.send();

	if(xhr.status === 200){
		try{
			const response = JSON.parse(xhr.responseText);

			if(response.data && response.data.length > 0){
				return response.data[0];
			}
		}catch(e){
			device.log(`GetAreaInfo: Parse error: ${e}`);
		}
	}else{
		device.log(`GetAreaInfo: HTTP ${xhr.status}`);
	}

	return null;
}

function onConnectionMade(){
	device.log("Connection Made!");
	isDtlsConnectionAlive = true;
}

function onConnectionClosed(){
	device.log("Connection Lost!");
	isDtlsConnectionAlive = false;
}

function onConnectionError(){
	device.log("Connection Error!");
	isDtlsConnectionAlive = false;
}

function onStreamStarted(){
	if(isStreamOpen){
		return;
	}

	device.log(`Stream Started!`);
	isStreamOpen = true;
	device.log("Starting Dtls Handshake...");

	dtls.onConnectionEstablished(onConnectionMade);
	dtls.onConnectionClosed(onConnectionClosed);
	dtls.onConnectionError(onConnectionError);

	dtls.createConnection(controller.ip, 2100, controller.username, controller.key);
}

function onStreamStopped(){
	device.log(`Stream Stopped!`);
	isStreamOpen = false;
	isStreamActive = false;
}

function getColors(){
	const channels = controller.areas[controller.selectedArea].channels;
	const RGBData = new Array(7 * channels.length);
	let index = 0;

	for(let i = 0; i < channels.length; i++){
		const channelId = channels[i].channel_id;

		RGBData[index] = channelId;

		const color = device.subdeviceColor(`Philips Hue Channel: ${channelId}`, 1, 1);

		const r = mapu8Tou16(color[0]);
		const g = mapu8Tou16(color[1]);
		const b = mapu8Tou16(color[2]);

		RGBData[index+1] = (r >> 8);
		RGBData[index+2] = r & 0xFF;
		RGBData[index+3] = (g >> 8);
		RGBData[index+4] = g & 0xFF;
		RGBData[index+5] = (b >> 8);
		RGBData[index+6] = b & 0xFF;

		index += 7;
	}

	return RGBData;
}

function getColorArr(r, g, b){
	const channels = controller.areas[controller.selectedArea].channels;
	const RGBData = new Array(7 * channels.length);
	let index = 0;

	const r16 = mapu8Tou16(r);
	const g16 = mapu8Tou16(g);
	const b16 = mapu8Tou16(b);

	for(let i = 0; i < channels.length; i++){
		const channelId = channels[i].channel_id;

		RGBData[index]   = channelId;
		RGBData[index+1] = (r16 >> 8);
		RGBData[index+2] = r16 & 0xFF;
		RGBData[index+3] = (g16 >> 8);
		RGBData[index+4] = g16 & 0xFF;
		RGBData[index+5] = (b16 >> 8);
		RGBData[index+6] = b16 & 0xFF;

		index += 7;
	}

	return RGBData;
}

function createHuePacket(RGBData){
	// "HueStream" as ASCII bytes
	let packet = [72, 117, 101, 83, 116, 114, 101, 97, 109];

	packet[9]  = 0x02; // Major version: 2 (V2 protocol)
	packet[10] = 0x00; // Minor version
	streamSequence = (streamSequence + 1) & 0xFF;
	packet[11] = streamSequence; // Sequence counter
	packet[12] = 0x00; // Reserved
	packet[13] = 0x00; // Reserved
	packet[14] = 0x00; // Color space: 0x00 = RGB
	packet[15] = 0x00; // Reserved

	// Entertainment configuration UUID as 36 ASCII bytes (e.g. "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
	const uuid = controller.areas[controller.selectedArea].id;

	for(let i = 0; i < 36; i++){
		packet[16 + i] = uuid.charCodeAt(i);
	}

	packet = packet.concat(RGBData);

	return packet;
}

function StartStream(){
	if(!CurrentArea){
		device.log("StartStream: no area selected.");

		return;
	}

	const xhr = new XMLHttpRequest();
	xhr.open("PUT", `http://127.0.0.1:18080/clip/v2/resource/entertainment_configuration/${CurrentArea}`, false);
	xhr.setRequestHeader("Accept", "application/json");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("hue-application-key", controller.username);
	xhr.send(JSON.stringify({action: "start"}));

	if(xhr.status === 200){
		device.log(xhr.responseText);

		try{
			const response = JSON.parse(xhr.responseText);

			if(response.data && response.data.length > 0){
				onStreamStarted();
			}
		}catch(e){
			device.log(`StartStream: Parse error: ${e}`);
		}
	}else{
		device.log(`StartStream: HTTP ${xhr.status}`);
	}
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null;
}

function StopStream(){
	const vColor = hexToRgb(disconnectColor);

	if(vColor){
		const xPacket = createHuePacket(getColorArr(vColor.r, vColor.g, vColor.b));
		dtls.send(xPacket, 1);
		dtls.send(xPacket, 1);
	}

	CloseStream();
}

function CloseStream(){
	const xhr = new XMLHttpRequest();
	xhr.open("PUT", `http://127.0.0.1:18080/clip/v2/resource/entertainment_configuration/${CurrentArea}`, false);
	xhr.setRequestHeader("Accept", "application/json");
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("hue-application-key", controller.username);
	xhr.send(JSON.stringify({action: "stop"}));

	if(xhr.status === 200){
		device.log(xhr.responseText);

		try{
			const response = JSON.parse(xhr.responseText);

			if(response.data && response.data.length > 0){
				onStreamStopped();
			}
		}catch(e){
			device.log(`CloseStream: Parse error: ${e}`);
		}
	}else{
		device.log(`CloseStream: HTTP ${xhr.status}`);
	}
}

let LastStreamCheck;
const STREAM_CHECK_INTERVAL = 5000;

export function Render() {
	if(isStreamActive){
		if(LastStreamCheck >= Date.now() - STREAM_CHECK_INTERVAL){
			return;
		}

		const AreaInfo = GetAreaInfo(CurrentArea);

		if(AreaInfo && AreaInfo.status !== "active"){
			isStreamActive = false;
		}

		if(TakeActiveStream){
			device.log(`Stealing Active Stream!`);
			StopStream();
		}

		LastStreamCheck = Date.now();

		return;
	}

	if(CurrentArea != controller.selectedArea){
		if(controller.selectedArea && controller.areas && controller.areas[controller.selectedArea]){
			device.log(`Selected Area Changed! Closing Connection!`);
			CloseDtlsSocket();
			device.log(`Selected Area Changed! Recreating Subdevices!`);
			createLightsForArea(controller.selectedArea);
		}

		return;
	}

	if(!isStreamOpen && !isDtlsConnectionAlive){
		const now = Date.now();

		if(CurrentArea && now - lastStreamAttempt >= STREAM_RETRY_INTERVAL){
			lastStreamAttempt = now;
			StartStream();
		}
	}

	if(isStreamOpen && isDtlsConnectionAlive){
		const iRet = dtls.send(createHuePacket(getColors()), 1);

		if(iRet < 0){
			device.log(`send(): Returned ${iRet}!`);
		}
	}
}

function mapu8Tou16(byte){
	return Math.floor((byte / 0xFF) * 0xFFFF);
}

function CloseDtlsSocket(){
	device.log(`Closing Dtls connection!`);

	if(isStreamOpen && isDtlsConnectionAlive){
		StopStream();
	}

	if(isDtlsConnectionAlive){
		dtls.CloseConnection();
	}
}

export function Shutdown() {
	CloseDtlsSocket();
}


function createLightsForArea(AreaId){
	for(const subdeviceId of device.getCurrentSubdevices()){
		device.log(`Removing subdevice: ${subdeviceId}`);
		device.removeSubdevice(subdeviceId);
	}

	const area = controller.areas?.[AreaId];

	if(!area){
		device.log(`createLightsForArea: area [${AreaId}] not found in controller.areas - skipping.`);

		return;
	}

	device.log(`Channels in current area: ${area.channels.length}`);

	for(const channel of area.channels){
		const channelId = channel.channel_id;

		// Resolve display name via entertainment service UUID in the lights map
		const entServiceId = channel.members?.[0]?.service?.rid;
		const lightName = (entServiceId && controller.lights[entServiceId]?.name)
			? controller.lights[entServiceId].name
			: `Channel ${channelId}`;

		const subdeviceId = `Philips Hue Channel: ${channelId}`;
		device.log(`Adding channel: ${channelId} -> "${lightName}"`);
		device.createSubdevice(subdeviceId);
		device.setSubdeviceName(subdeviceId, lightName);
		device.setSubdeviceSize(subdeviceId, 3, 3);
		device.setSubdeviceImageUrl(subdeviceId, "");
		device.setSubdeviceLeds(subdeviceId, ["Device"], [[1, 1]]);
	}

	CurrentArea = AreaId;
}

// -------------------------------------------<( Discovery Service )>--------------------------------------------------

export class DiscoveryService {
	constructor(){
		this.IconUrl = "https://assets.signalrgb.com/brands/philips/logo.png";

		this.MDns = [
			"_hue._tcp.local."
		];

		this.firstrun = true;
		this.cache = new IPCache();
	}

	Initialize(){
		service.log("Initializing Plugin!");
		// Note: bridge URLs are routed through local proxy http://127.0.0.1:18080 (see hue-proxy.js)
		// to work around Qt QML XHR rejecting Hue Bridge Pro's self-signed cert.
		service.log("Searching for network devices...");
	}

	Update(){
		if(this.firstrun){
			this.firstrun = false;
			this.LoadCachedDevices();
		}

		for(const cont of service.controllers){
			cont.obj.update();
		}
	}

	Shutdown(){

	}

	Discovered(value){
		service.log(`New host discovered!`);
		service.log(value);
		this.CreateController(value);
	}

	Removal(value){
		service.log(`${value.hostname} was removed from the network!`);
	}

	CreateController(value){
		const bridgeid = value?.bridgeid ?? value?.id;
		const controller = service.getController(bridgeid);

		if(controller === undefined){
			service.addController(new HueBridge(value));
		}else{
			controller.updateWithValue(value);
			service.log(`Updated: ${controller.bridgeid}`);
		}
	}

	LoadCachedDevices(){
		service.log("Loading Cached Devices...");

		for(const [key, value] of this.cache.Entries()){
			service.log(`Found Cached Device: [${key}: ${JSON.stringify(value)}]`);
			this.CreateController(value);
		}
	}

	unlinkController(controllerObj){
		service.log(`Unlinking controller: ${JSON.stringify(controllerObj)}`);

		const cachedController = this.cache.Get(controllerObj.id);

		if(!cachedController){
			service.log(`Controller ${controllerObj.id} not found in cache`);

			return;
		}

		const controller = service.getController(cachedController.id);

		if(!controller){
			service.log(`Controller ${cachedController.id} not found in service`);

			return;
		}

		controller.connected = false;
		controller.updateWithValue(controller);
		service.suppressController(controller);

		this.cacheControllerInfo(controller);
		service.log(`Cache updated after unlink: ${JSON.stringify(controller)}`);
	}

	forgetController(bridgeId){
		this.cache.Remove(bridgeId);

		for(const controller of service.controllers){
			if(controller.id === bridgeId){
				service.suppressController(controller);
				service.removeController(controller);

				return;
			}
		}
	}

	cacheControllerInfo(value){
		discovery.cache.Add(
			value.id, {
				hostname: value.hostname,
				name:     value.name,
				port:     value.port,
				modelid:  value.modelid,
				bridgeid: value.bridgeid,
				ip:       value.ip,
				deviceImage: value.deviceImage,
				connected:   value.connected
			}
		);
	}
}

class HueBridge {
	constructor(value){
		this.updateWithValue(value);

		this.ip = "";
		this.key = service.getSetting(this.id, "key") ?? "";
		this.username = service.getSetting(this.id, "username") ?? "";
		// Optional: pre-seed credentials for specific bridge IDs to skip the in-UI link flow.
		// Pair manually via the Hue v2 API once (POST /api with {devicetype, generateclientkey:true})
		// and paste the username/clientkey here keyed by your bridge ID.
		// This is only useful if SignalRGB's link-button polling misses the bridge button press window.
		const PRESET_CREDS = {
			// "your-bridge-id-lowercase": { username: "...", key: "..." },
		};
		const preset = PRESET_CREDS[this.id];
		if(preset && (!this.key || !this.username)){
			service.log(`Seeding preset credentials for bridge ${this.id}`);
			this.key = preset.key;
			this.username = preset.username;
			service.saveSetting(this.id, "key", this.key);
			service.saveSetting(this.id, "username", this.username);
		}


		this.areas = {};

		this.lights = {};

		this.connected = this.key != "";
		this.retriesleft = 60;
		this.waitingforlink = false;
		this.selectedArea = service.getSetting(this.id, "selectedArea") ?? "";
		this.selectedAreaName = service.getSetting(this.id, "selectedAreaName") ?? "";
		this.instantiated = false;
		this.lastPollingTimeStamp = 0;
		this.pollingInterval = 60000;
		this.supportsStreaming = false;
		this.apiversion = "";
		this.currentlyValidatingIP = false;
		this.currentlyResolvingIP = false;
		this.failedToValidateIP = false;
		this.deviceImage = value?.deviceImage ?? "https://assets.signalrgb.com/devices/brands/philips/misc/bridge.png";

		this.DumpBridgeInfo();

		const ip = value?.ip;

		if(ip){
			this.ValidateIPAddress(ip);
		}else{
			this.ResolveIpAddress();
		}
	}

	ValidateIPAddress(ip){
		// NOTE: This validates whatever bridge the local proxy points at (HUE_BRIDGE_HOST or
		// the first auto-discovered bridge). The supplied `ip` arg is recorded as `instance.ip`
		// for DTLS streaming but is NOT used as the REST target. Single-bridge setups only.
		// For multi-bridge support the proxy would need per-bridge routing (e.g. host header).
		this.currentlyValidatingIP = true;
		service.updateController(this);

		const instance = this;
		service.log(`Attempting to validate ip address: ${ip}`);

		const xhr = new XMLHttpRequest();
		xhr.open("GET", `http://127.0.0.1:18080/api/config`, false);
		xhr.send();

		service.log(`ValidateIPAddress: status=${xhr.status}`);

		if(xhr.status === 200){
			service.log(`ip [${ip}] is a valid Hue bridge!`);
			instance.ip = ip;
			instance.SetConfig(JSON.parse(xhr.responseText));
		}else{
			service.log(`ip [${ip}] failed with status ${xhr.status} - not a Hue bridge.`);
			instance.failedToValidateIP = true;
			instance.ResolveIpAddress();
		}

		instance.currentlyValidatingIP = false;
		service.updateController(instance);
	}

	cacheControllerInfo(){
		discovery.cache.Add(this.id, {
			hostname: this.hostname,
			name: this.name,
			port: this.port,
			modelid: this.model,
			bridgeid: this.id,
			ip: this.ip,
			deviceImage: this.deviceImage,
			connected: this.connected
		});
	}

	DumpBridgeInfo(){
		service.log("hostname: "+this.hostname);
		service.log("name: "+this.name);
		service.log("port: "+this.port);
		service.log("id: "+this.id);
		service.log("ip: " + (this.ip || "unknown"));
		service.log("model: "+this.model);
		service.log("username: "+(this.username || "unknown"));
		service.log("key: "+(this.key || "unknown"));
		service.log("selectedArea: "+(this.selectedArea || "unknown"));
		service.log("selectedAreaName: "+(this.selectedAreaName || "unknown"));
	}

	ForgetLink(){
		service.saveSetting(this.id, "key", undefined);
		service.saveSetting(this.id, "username", undefined);
		this.key = "";
		this.username = "";
		this.connected = false;
	}

	ResolveIpAddress(){
		service.log("Attempting to resolve IPV4 address...");

		const instance = this;
		service.resolve(this.hostname, (host) => {
			if(host.protocol === "IPV4"){
				instance.ip = host.ip;
				service.log(`Found IPV4 address: ${host.ip}`);
				instance.RequestBridgeConfig();
				instance.deviceImage = "https://assets.signalrgb.com/devices/brands/philips/misc/bridge.png";

				instance.cacheControllerInfo();
				this.currentlyResolvingIP = false;
				this.failedToValidateIP = false;
				service.updateController(instance);
			}else if(host.protocol === "IPV6"){
				service.log(`Skipping IPV6 address: ${host.ip}`);
			}else{
				service.log(`unknown IP config: [${JSON.stringify(host)}]`);
			}
		});
	}

	CreateBridgeDevice(){
		service.updateController(this);
		service.announceController(this);
	}

	setSelectedArea(AreaId){
		if(this.areas.hasOwnProperty(AreaId)){
			this.selectedArea = AreaId;
			service.log(this.areas[AreaId].name);
			this.selectedAreaName = this.areas[AreaId].name;
			service.saveSetting(this.id, "selectedArea", this.selectedArea);
			service.saveSetting(this.id, "selectedAreaName", this.selectedAreaName);
			service.updateController(this);
			service.log(`Set Selected Area to: [${this.selectedAreaName}], Id: [${this.selectedArea}]`);
		}
	}

	updateWithValue(value){
		service.log(value);
		this.hostname = value.hostname;

		if(!this.config?.name){
			this.name = value.name;
		}

		this.port = value.port;
		this.id = value.hasOwnProperty("bridgeid") ? value.bridgeid : value.id;
		this.model = value.hasOwnProperty("bridgeid") ? value.modelid : value.md;

		service.log("Updated: " + this.name);
		service.updateController(this);
	}

	setClientKey(response) {
		service.log("Setting key: "+ response.clientkey);

		this.key = response.clientkey;
		service.saveSetting(this.id, "key", this.key);

		this.username = response.username;
		service.saveSetting(this.id, "username", this.username);

		this.retriesleft = 0;
		this.waitingforlink = false;
		this.connected = true;

		// Immediately fetch lights and areas after connection so the UI
		// populates without waiting for the first polling interval
		this.RequestLightInfo();
		this.RequestAreaInfo();

		service.updateController(this);
	}

	requestLink(){
		const instance = this;
		service.log("requesting link for "+this.name);

		const xhr = new XMLHttpRequest();
		xhr.open("POST", `http://127.0.0.1:18080/api`, false);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.send(JSON.stringify({devicetype: "SignalRGB", generateclientkey: true}));

		service.log(`requestLink: status=${xhr.status}`);

		if(xhr.status === 200){
			const response = JSON.parse(xhr.responseText)[0];
			service.log(JSON.stringify(response));

			if(response.error === undefined && response.success){
				instance.setClientKey(response.success);
			}
		}
	}

	startLink() {
		service.log("Pushlink test for "+this.name);
		this.retriesleft = 60;
		this.waitingforlink = true;
		service.updateController(this);
	}

	update() {
		if(this.currentlyValidatingIP){
			return;
		}

		if(this.failedToValidateIP){
			return;
		}

		if(this.waitingforlink){
			this.retriesleft--;
			this.requestLink();

			if(this.retriesleft <= 0){
				this.waitingforlink = false;
			}

			service.updateController(this);
		}

		if(!this.connected){
			service.updateController(this);

			return;
		}

		if(!this.instantiated && this.lights && this.areas && Object.keys(this.areas).length > 0){
			this.CreateBridgeDevice();
			this.instantiated = true;
		}

		if(Date.now() - this.lastPollingTimeStamp > this.pollingInterval){
			service.log("Polling bridge Info...");
			this.RequestLightInfo();
			this.RequestAreaInfo();

			this.lastPollingTimeStamp = Date.now();
		}
	}

	RequestAreaInfo(){
		const instance = this;
		service.log("Requesting Area Info (V2)...");

		const xhr = new XMLHttpRequest();
		xhr.open("GET", `http://127.0.0.1:18080/clip/v2/resource/entertainment_configuration`, false);
		xhr.setRequestHeader("Accept", "application/json");
		xhr.setRequestHeader("hue-application-key", this.username);
		xhr.send();

		service.log(`RequestAreaInfo: status=${xhr.status}`);

		if(xhr.status === 200){
			try{
				const response = JSON.parse(xhr.responseText);
				instance.areas = {};

				for(const area of (response.data ?? [])){
					if(!area) continue;

					instance.areas[area.id] = {
						id:              area.id,
						name:            area.metadata?.name ?? "Unknown",
						channels:        area.channels ?? [],
						status:          area.status,
						active_streamer: area.active_streamer ?? null,
					};

					service.log(`Area: ${area.metadata?.name} (${area.id}) - ${(area.channels ?? []).length} channels`);
				}

				service.updateController(instance);
			}catch(e){
				service.log(`RequestAreaInfo: Parse error: ${e}`);
			}
		}
	}

	RequestLightInfo(){
		const instance = this;
		service.log("Requesting Device Info (V2)...");

		const xhr = new XMLHttpRequest();
		xhr.open("GET", `http://127.0.0.1:18080/clip/v2/resource/device`, false);
		xhr.setRequestHeader("Accept", "application/json");
		xhr.setRequestHeader("hue-application-key", this.username);
		xhr.send();

		service.log(`RequestLightInfo: status=${xhr.status}`);

		if(xhr.status === 200){
			try{
				const response = JSON.parse(xhr.responseText);
				instance.lights = {};

				for(const dev of (response.data ?? [])){
					if(!dev) continue;

					const deviceName = dev.metadata?.name ?? "Unknown";

					for(const svc of (dev.services ?? [])){
						if(svc.rtype === "entertainment"){
							instance.lights[svc.rid] = {name: deviceName, id: svc.rid};
							service.log(`Device: "${deviceName}" -> entertainment service: ${svc.rid}`);
						}
					}
				}

				service.updateController(instance);
			}catch(e){
				service.log(`RequestLightInfo: Parse error: ${e}`);
			}
		}
	}

	SetConfig(response){
		this.config = response;
		service.log(JSON.stringify(this.config));
		this.apiversion = response.apiversion;
		service.log(`Api Version: ${this.apiversion}`);

		if(this.StreamableAPIVersion(this.apiversion)){
			this.supportsStreaming = true;
		}

		if(this.config.name && this.config.name !== "Philips hue"){
			this.name = this.config.name;
		}

		service.updateController(this);
	}

	/** Entertainment streaming requires bridge API >= 1.22.0 */
	StreamableAPIVersion(apiversion){
		return Semver.isGreaterThanOrEqual(apiversion, "1.22.0");
	}

	RequestBridgeConfig(){
		const instance = this;
		service.log(`Requesting bridge config...`);

		const xhr = new XMLHttpRequest();
		xhr.open("GET", `http://127.0.0.1:18080/api/config`, false);
		xhr.send();

		service.log(`RequestBridgeConfig: status=${xhr.status}`);

		if(xhr.status === 200){
			try{
				instance.SetConfig(JSON.parse(xhr.responseText));
			}catch(e){
				service.log(`RequestBridgeConfig: Parse error: ${e}`);
			}
		}
	}
}

class IPCache{
	constructor(){
		this.cacheMap = new Map();
		this.persistanceId = "ipCache";
		this.persistanceKey = "cache";

		this.PopulateCacheFromStorage();
	}

	Add(key, value){
		service.log(`Adding ${key} to IP Cache...`);

		this.cacheMap.set(key, value);
		this.Persist();
	}

	Remove(key){
		this.cacheMap.delete(key);
		this.Persist();
	}

	Has(key){
		return this.cacheMap.has(key);
	}

	Get(key){
		return this.cacheMap.get(key);
	}

	Entries(){
		return this.cacheMap.entries();
	}

	PopulateCacheFromStorage(){
		service.log("Populating IP Cache from storage...");

		const storage = service.getSetting(this.persistanceId, this.persistanceKey);

		if(storage === undefined){
			service.log(`IP Cache is empty...`);

			return;
		}

		let mapValues;

		try{
			mapValues = JSON.parse(storage);
		}catch(e){
			service.log(e);
		}

		if(mapValues === undefined){
			service.log("Failed to load cache from storage! Cache is invalid!");

			return;
		}

		if(mapValues.length === 0){
			service.log(`IP Cache is empty...`);
		}

		this.cacheMap = new Map(mapValues);
	}

	Persist(){
		service.log("Saving IP Cache...");
		service.saveSetting(this.persistanceId, this.persistanceKey, JSON.stringify(Array.from(this.cacheMap.entries())));
	}

	DumpCache(){
		for(const [key, value] of this.cacheMap.entries()){
			service.log([key, value]);
		}
	}
}

class Semver{
	static isEqualTo(a, b){
		return this.compare(a, b) === 0;
	}

	static isGreaterThan(a, b){
		return this.compare(a, b) > 0;
	}

	static isLessThan(a, b){
		return this.compare(a, b) < 0;
	}

	static isGreaterThanOrEqual(a, b){
		return this.compare(a, b) >= 0;
	}

	static isLessThanOrEqual(a, b){
		return this.compare(a, b) <= 0;
	}

	static compare(a, b){
		const parsedA = a.split(".").map((x) => parseInt(x));
		const parsedB = b.split(".").map((x) => parseInt(x));

		return this.recursiveCompare(parsedA, parsedB);
	}

	static recursiveCompare(a, b){
		if(a.length === 0){ a = [0]; }
		if(b.length === 0){ b = [0]; }

		if(a[0] !== b[0] || (a.length === 1 && b.length === 1)){
			if(a[0] < b[0]){ return -1; }
			if(a[0] > b[0]){ return 1; }

			return 0;
		}

		return this.recursiveCompare(a.slice(1), b.slice(1));
	}
}

export function ImageUrl(){
	return "https://assets.signalrgb.com/devices/brands/philips/misc/bridge.png";
}
