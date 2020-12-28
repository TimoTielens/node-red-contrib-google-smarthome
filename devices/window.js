/**
 * NodeRED Google SmartHome
 * Copyright (C) 2020 Michael Jacobsen.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 **/

module.exports = function(RED) {
    "use strict";

    const formats = require('../formatvalues.js');
    const util    = require('util');

    /******************************************************************************************************************
     *
     *
     */
    function WindowNode(config) {
        RED.nodes.createNode(this, config);

        this.client     = config.client;
        this.clientConn = RED.nodes.getNode(this.client);
        this.topicOut   = config.topic;
        this.passthru   = config.passthru;
        this.topicDelim = '/';

        if (!this.clientConn) {
            this.error(RED._("window.errors.missing-config"));
            this.status({fill:"red", shape:"dot", text:"Missing config"});
            return;
        } else if (typeof this.clientConn.register !== 'function') {
            this.error(RED._("window.errors.missing-bridge"));
            this.status({fill:"red", shape:"dot", text:"Missing SmartHome"});
            return;
        }

        let node = this;

        RED.log.debug("WindowNode(): node.topicOut = " + node.topicOut);

        /******************************************************************************************************************
         * called to register device
         *
         */
        this.registerDevice = function (client, name) {
            let states = {
                online: true,
                openPercent: 0
            };

            let device = {
                id: client.id,
                properties: {
                    type: 'action.devices.types.WINDOW',
                    traits: ['action.devices.traits.OpenClose'],
                    name: {
                        defaultNames: ["Node-RED Window"],
                        name: name
                    },
                    willReportState: true,
                    attributes: {},
                    deviceInfo: {
                        manufacturer: 'Node-RED',
                        model: 'nr-window-v1',
                        swVersion: '1.0',
                        hwVersion: '1.0'
                    },
                    customData: {
                        "nodeid": client.id,
                        "type": 'window'
                    }
                }
            };

            device.states = states;

            return device;
        }

        this.updateStatusIcon = function(states) {
            if (states.openPercent === 0) {
                node.status({fill:"green", shape:"dot", text:"CLOSED"});
            } else {
                node.status({fill:"red", shape:"dot", text: util.format("OPEN %d%%", states.openPercent)});
            }
        }

        /******************************************************************************************************************
         * called when state is updated from Google Assistant
         *
         */
        this.updated = function(device) {   // this must be defined before the call to clientConn.register()
            let states = device.states;
            let command = device.command;
            RED.log.debug("WindowNode(updated): states = " + JSON.stringify(states));

            node.updateStatusIcon(states);

            let msg = {
                topic: node.topicOut,
                device_name: device.properties.name.name,
                command: command,
                payload: {
                    online: states.online,
                    openPercent: states.openPercent,
                },
            };

            node.send(msg);
        };

        this.states = this.clientConn.register(this, 'window', config.name);

        this.status({fill:"yellow", shape:"dot", text:"Ready"});

        /******************************************************************************************************************
         * respond to inputs from NodeRED
         *
         */
        this.on('input', function (msg) {
            RED.log.debug("WindowNode(input)");

            let topicArr = String(msg.topic).split(node.topicDelim);
            let topic    = topicArr[topicArr.length - 1];   // get last part of topic

            RED.log.debug("WindowNode(input): topic = " + topic);

            try {
                if (topic.toUpperCase() === 'OPENPERCENT') {
                    RED.log.debug("WindowNode(input): OPEN/OPENPERCENT");
                    let openPercent;
                    if(msg.payload.toString().toUpperCase() === 'TRUE')
                        openPercent = 100;
                    else if(msg.payload.toString().toUpperCase() === 'FALSE')
                        openPercent = 0;
                    else
                        openPercent = formats.FormatValue(formats.Formats.INT, 'openPercent', msg.payload);

                    if (node.states.openPercent !== openPercent) {
                        node.states.openPercent = openPercent;

                        node.clientConn.setState(node, node.states);  // tell Google ...

                        if (node.passthru) {
                            msg.payload = node.states.openPercent;
                            node.send(msg);
                        }
                    }

                    node.updateStatusIcon(node.states);
                } else if (topic.toUpperCase() === 'ONLINE') {
                    RED.log.debug("WindowNode(input): ONLINE");
                    let online = formats.FormatValue(formats.Formats.BOOL, 'online', msg.payload);

                    if (node.states.online !== online) {
                        node.states.online = online;

                        node.clientConn.setState(node, node.states);  // tell Google ...

                        if (node.passthru) {
                            msg.payload = node.states.online;
                            node.send(msg);
                        }
                    }
                } else {
                    RED.log.debug("WindowNode(input): some other topic");
                    let object = {};

                    if (typeof msg.payload === 'object') {
                        object = msg.payload;
                    } else {
                        RED.log.debug("WindowNode(input): typeof payload = " + typeof msg.payload);
                        return;
                    }

                    let openPercent     = node.states.openPercent;
                    let online = node.states.online;

                    // openPercent
                    if (object.hasOwnProperty('openPercent')) {
                        if(object.openPercent.toString().toUpperCase() === 'TRUE')
                            openPercent = 100;
                        else if(object.openPercent.toString().toUpperCase() === 'FALSE')
                            openPercent = 0;
                        else
                            openPercent = formats.FormatValue(formats.Formats.INT, 'openPercent', object.openPercent);
                    }

                    // online
                    if (object.hasOwnProperty('online')) {
                        online = formats.FormatValue(formats.Formats.BOOL, 'online', object.online);
                    }

                    if (node.states.openPercent !== openPercent || node.states.online !== online){
                        node.states.openPercent     = openPercent;
                        node.states.online = online;

                        node.clientConn.setState(node, node.states);  // tell Google ...

                        if (node.passthru) {
                            msg.payload = node.states;
                            node.send(msg);
                        }

                        node.updateStatusIcon(node.states);
                    }
                }
            } catch (err) {
                RED.log.error(err);
            }
        });

        this.on('close', function(removed, done) {
            if (removed) {
                // this node has been deleted
                node.clientConn.remove(node, 'window');
            } else {
                // this node is being restarted
                node.clientConn.deregister(node, 'window');
            }
            
            done();
        });
    }

    RED.nodes.registerType("google-window", WindowNode);
}