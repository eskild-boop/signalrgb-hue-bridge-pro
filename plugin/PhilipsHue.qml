import QtQuick.Layouts

Item {
    anchors.fill: parent

    Column{
        width: parent.width
        height: parent.height
        spacing: 10

        Pane {
            width: parent.width
            height: (contentHeight + padding * 2) + 30

            background: Rectangle {
                color: "#070d16"
                radius: 8
                border.color: "#18232e"
                border.width: 1.5
            }

            GridLayout {
                id: grid
                anchors.fill: parent
                columns: 3
                rowSpacing: 2
                columnSpacing: 2

                BusyIndicator {
                    id: scanningIndicator
                    Layout.row: 0
                    Layout.column: 0
                    Layout.columnSpan: 1
                    Layout.fillWidth: true

                    Material.accent: "#88FFFFFF"
                    running: true
                    implicitWidth: 40
                    implicitHeight: 40
                }

                Text{
                    id: scanningText
                    Layout.row: 0
                    Layout.column: 1
                    Layout.columnSpan: 2
                    Layout.fillWidth: true

                    verticalAlignment: Text.AlignVCenter
                    color: "#88FFFFFF"
                    text: "Searching network for devices. \nThis may take several minutes..."
                    font.pixelSize: 14
                    font.family: "Red Hat Display"
                }
            }
        }

        ScrollView {
            width: parent.width
            height: parent.height - y
            clip: true
            ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

            Grid {
                id: deviceGrid
                width: parent.parent.width
                columns: Math.max(1, Math.floor(width / 362))
                spacing: 10

                property int itemWidth: (width - (columns - 1) * spacing) / columns

                Repeater{
                    model: service.controllers

                    delegate: Pane {
                        id: root
                        width: deviceGrid.itemWidth
                        height: (contentHeight + padding * 2) + 30
                        padding: 12

                        background: Rectangle {
                            color: "#070d16"
                            radius: 8
                            border.color: "#18232e"
                            border.width: 3
                        }

                        property var device: model.modelData.obj

                        ColumnLayout{
                            width: parent.width
                            spacing: 4

                            Item{
                                Layout.fillWidth: true
                                height: {
                                    let needsHelperText = false;
                                    if (!root.device.supportsStreaming && root.device.apiversion != "") {
                                        needsHelperText = true;
                                    } else if (root.device.connected && root.device.supportsStreaming && Object.keys(root.device.areas).length == 0) {
                                        needsHelperText = true;
                                    } else if (!root.device.connected && root.device.waitingforlink) {
                                        needsHelperText = true;
                                    }

                                    let hasAreaPicker = root.device.connected && Object.keys(root.device.areas).length > 0;

                                    if (hasAreaPicker) {
                                        return 200;
                                    }
                                    if (!needsHelperText) {
                                        return 100;
                                    }

                                    return 160;
                                }

                                Image {
                                    id: deviceImage
                                    anchors.left: parent.left
                                    anchors.leftMargin: 10
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: 120
                                    height: 120
                                    source: root.device.deviceImage || "https://assets.signalrgb.com/devices/brands/philips/misc/bridge.png"
                                    antialiasing: false
                                    mipmap: false
                                }

                                Item {
                                    id: textContainer
                                    anchors.left: deviceImage.right
                                    anchors.leftMargin: 10
                                    anchors.right: parent.right
                                    anchors.rightMargin: 10
                                    anchors.top: parent.top
                                    height: 100

                                    Text{
                                        y: 0
                                        id: deviceName
                                        anchors.left: parent.left
                                        anchors.right: removeButton.left
                                        anchors.rightMargin: 10
                                        color: theme.primarytextcolor
                                        text: root.device.name
                                        font.pixelSize: 18
                                        font.family: theme.primaryfont
                                        font.weight: Font.Bold
                                        verticalAlignment: Text.AlignVCenter
                                        elide: Text.ElideRight
                                    }

                                    Text{
                                        y: 26
                                        anchors.left: parent.left
                                        anchors.right: removeButton.left
                                        anchors.rightMargin: 10
                                        font.pixelSize: 12
                                        font.family: "Montserrat Regular"
                                        verticalAlignment: Text.AlignVCenter
                                        color: theme.secondarytextcolor
                                        text: `ID: ${root.device.id}`
                                        elide: Text.ElideRight
                                    }

                                    Text{
                                        y: 42
                                        anchors.left: parent.left
                                        anchors.right: removeButton.left
                                        anchors.rightMargin: 10
                                        font.pixelSize: 12
                                        font.family: "Montserrat Regular"
                                        verticalAlignment: Text.AlignVCenter
                                        color: theme.secondarytextcolor
                                        text: `Model: ${root.device.model}`
                                        elide: Text.ElideRight
                                    }

                                    Text{
                                        y: 58
                                        anchors.left: parent.left
                                        anchors.right: removeButton.left
                                        anchors.rightMargin: 10
                                        font.pixelSize: 12
                                        font.family: "Montserrat Regular"
                                        verticalAlignment: Text.AlignVCenter
                                        color: theme.secondarytextcolor
                                        text: "IP Address: " + (root.device.ip ?? "Unknown")
                                        elide: Text.ElideRight
                                    }

                                    Text{
                                        y: 74
                                        anchors.left: parent.left
                                        anchors.right: removeButton.left
                                        anchors.rightMargin: 10
                                        font.pixelSize: 12
                                        font.family: "Montserrat Regular"
                                        verticalAlignment: Text.AlignVCenter
                                        color: theme.secondarytextcolor
                                        text: "API Version: " + (root.device.apiversion || "Unknown")
                                        elide: Text.ElideRight
                                    }

                                    SIconButton{
                                        id: removeButton
                                        anchors.right: parent.right
                                        anchors.top: parent.top
                                        width: 24
                                        height: 24
                                        iconSize: height

                                        icon.source: "qrc:/icons/Resources/Icons/Material/close_white_48dp.svg"

                                        onClicked: {
                                            discovery.forgetController(device.id)
                                        }
                                    }
                                }

                                SButton {
                                    id: deviceLink
                                    anchors.left: deviceImage.right
                                    anchors.leftMargin: 10
                                    anchors.top: textContainer.bottom

                                    color: (root.device.connected === true) ? hovered ? Qt.darker("#394e61", 1.5) : "#394e61" : hovered ? Qt.darker("#5664b1", 1.5) : "#5664b1"

                                    label.font.pixelSize: 16
                                    label.text: (root.device.connected === true) ? "Unlink" : (root.device.waitingforlink === true) ? "Linking" : "Link"
                                    label.font.family: "Red Hat Display"
                                    label.font.bold: true

                                    enabled: {
                                        if (!root.device.supportsStreaming && root.device.apiversion != "") {
                                            return false;
                                        }
                                        if (root.device.connected && root.device.supportsStreaming && Object.keys(root.device.areas).length == 0) {
                                            return false;
                                        }
                                        return true;
                                    }

                                    width: Math.min(210, textContainer.width + 10)
                                    height: 32

                                    onClicked: {
                                        if(root.device.connected === true){
                                            discovery.unlinkController(root.device);
                                        }else {
                                            device.startLink();
                                        }
                                    }
                                }

                                Text{
                                    anchors.left: deviceImage.right
                                    anchors.leftMargin: 10
                                    anchors.top: deviceLink.bottom
                                    anchors.topMargin: 4
                                    anchors.right: parent.right
                                    anchors.rightMargin: 10
                                    color: theme.warn
                                    font.pixelSize: 11
                                    font.family: "Montserrat Regular"
                                    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                                    text: {
                                        if (!root.device.supportsStreaming && root.device.apiversion != "") {
                                            return "Bridge firmware doesn't support streaming. API Version must be at least 1.22.0";
                                        } else if (root.device.connected && root.device.supportsStreaming && Object.keys(root.device.areas).length == 0) {
                                            return "No Entertainment zones found. Create one in the Philips Hue app first.";
                                        } else if (!root.device.connected && root.device.waitingforlink) {
                                            return "Press the button on your bridge to complete linking...";
                                        }
                                        return "";
                                    }
                                    visible: text !== ""
                                }

                                Text{
                                    id: areaLabel
                                    anchors.left: deviceImage.right
                                    anchors.leftMargin: 10
                                    anchors.top: deviceLink.bottom
                                    anchors.topMargin: 8
                                    text: "Streaming Area"
                                    color: theme.secondarytextcolor
                                    font.pixelSize: 12
                                    visible: root.device.connected && Object.keys(root.device.areas).length > 0
                                }

                                SComboBox{
                                    id: areaComboBox
                                    anchors.left: deviceImage.right
                                    anchors.leftMargin: 10
                                    anchors.top: areaLabel.bottom
                                    anchors.topMargin: 4
                                    width: Math.min(280, textContainer.width + 10)
                                    height: 32
                                    model: Object.values(root.device.areas)
                                    textRole: "name"
                                    valueRole: "id"
                                    property bool ready: false
                                    visible: root.device.connected && Object.keys(root.device.areas).length > 0

                                    onActivated: {
                                        if(!ready) return;
                                        root.device.setSelectedArea(areaComboBox.currentValue);
                                    }
                                    onModelChanged: {
                                        let idx = areaComboBox.find(root.device.selectedAreaName)
                                        if(idx >= 0) areaComboBox.currentIndex = idx;
                                    }
                                    Component.onCompleted: {
                                        let idx = areaComboBox.find(root.device.selectedAreaName)
                                        if(idx >= 0) areaComboBox.currentIndex = idx;
                                        ready = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
