
/* jshint undef: true, unused: true, undef: true */
/* global global, require, console, MODULE_LOADER, MODULE_CHROME, createDeviceSelectorViewGenerator */
/* exported activeModule */

// console.log('in device_selector, controller.js');

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var package_loader;
var q;
var gns;
var io_manager;
var driver_const;
try {
	package_loader = global.require.main.require('ljswitchboard-package_loader');
	q = global.require.main.require('q');
	gns = package_loader.getNameSpace();
	io_manager = global.require.main.require('ljswitchboard-io_manager');
	driver_const = global.require('ljswitchboard-ljm_driver_constants');
} catch(err) {
	package_loader = require.main.require('ljswitchboard-package_loader');
	q = require.main.require('q');
	gns = package_loader.getNameSpace();
	io_manager = require.main.require('ljswitchboard-io_manager');
	driver_const = require.main.require('ljswitchboard-ljm_driver_constants');
}

var createModuleInstance = function() {
	// var io_manager = global[gns].io_manager;
	var io_interface = io_manager.io_interface();
	// var driver_controller = io_interface.getDriverController();
	var device_controller = io_interface.getDeviceController();

	// var getCachedListAllDevices = device_controller.getCachedListAllDevices;
	var listAllDevices = device_controller.listAllDevices;

	this.moduleData = {};
	this.eventList = {
		'MODULE_STARTED': 'MODULE_STARTED',
		'MODULE_STOPPED': 'MODULE_STOPPED',
		'DEVICE_SCAN_STARTED': 'DEVICE_SCAN_STARTED',
		'DEVICE_SCAN_COMPLETED': 'DEVICE_SCAN_COMPLETED',
		'DEVICE_OPENED': 'DEVICE_OPENED',
		'DEVICE_CLOSED': 'DEVICE_CLOSED',
		'VIEW_GEN_DEVICE_OPENED': 'VIEW_GEN_DEVICE_OPENED',
		'VIEW_GEN_DEVICE_FAILED_TO_OPEN': 'VIEW_GEN_DEVICE_FAILED_TO_OPEN',
		'VIEW_GEN_DEVICE_CLOSED': 'VIEW_GEN_DEVICE_CLOSED',
		'VIEW_GEN_DEVICE_FAILED_TO_CLOSE': 'VIEW_GEN_DEVICE_FAILED_TO_CLOSE',
	};
	var forwardedViewGenEvents = {
		DEVICE_OPENED: 'VIEW_GEN_DEVICE_OPENED',
		DEVICE_FAILED_TO_OPEN: 'VIEW_GEN_DEVICE_FAILED_TO_OPEN',
		DEVICE_CLOSED: 'VIEW_GEN_DEVICE_CLOSED',
		DEVICE_FAILED_TO_CLOSE: 'VIEW_GEN_DEVICE_FAILED_TO_CLOSE',
	};

	var eventsToForwardToModuleChrome = {
		DEVICE_OPENED: 'DEVICE_SELECTOR_DEVICE_OPENED',
		// DEVICE_FAILED_TO_OPEN: 'VIEW_GEN_DEVICE_FAILED_TO_OPEN',
		DEVICE_CLOSED: 'DEVICE_SELECTOR_DEVICE_CLOSED',
		// DEVICE_FAILED_TO_CLOSE: 'VIEW_GEN_DEVICE_FAILED_TO_CLOSE',
	};
	this.debug = false;

	// Create a new viewGen object
	this.viewGen = new createDeviceSelectorViewGenerator();

	var allowDeviceControl = true;
	this.enableDeviceControl = function() {
		allowDeviceControl = true;
	};
	this.disableDeviceControl = function() {
		allowDeviceControl = false;
	};

	var reportScanStarted = function(scanData) {
		var defered = q.defer();
		self.emit(self.eventList.DEVICE_SCAN_STARTED, scanData);
		defered.resolve(scanData);
		return defered.promise;
	};
	var reportScanFinished = function(scanData) {
		var defered = q.defer();
		self.emit(self.eventList.DEVICE_SCAN_COMPLETED, scanData);
		defered.resolve(scanData);
		return defered.promise;
	};
	this.performDeviceScan = function() {
		var defered = q.defer();

		var promises = [];
		promises.push(self.viewGen.displayScanInProgress());
		promises.push(
			reportScanStarted()
			.then(listAllDevices)
			
		);

		q.allSettled(promises)
		.then(function(res) {			var scanResults = res[1].value; // the second result (1st element);
			self.viewGen.displayScanResults(scanResults)
			.then(reportScanFinished)
			.then(defered.resolve);
		}, defered.reject);
		return defered.promise;
	};
	var buttonEventHandlers = {
		'REFRESH_DEVICES': this.performDeviceScan,
	};

	// Attach to viewGen events
	var getViewGenEventListener = function(eventName) {
		var viewGenEventListener = function(eventData) {
			// console.log('viewGen event', eventName, eventData);
			// If the event has some valid data, call its event handler.
			if(eventData.type) {
				if(eventData.type === 'button') {
					if(buttonEventHandlers[eventName]) {
						buttonEventHandlers[eventName](eventData);
					}
				}
			}

			// If the event should be forwarded, then forward it.
			if(forwardedViewGenEvents[eventName]) {
				self.emit(forwardedViewGenEvents[eventName], eventData);
			}

			if(eventsToForwardToModuleChrome[eventName]) {
				MODULE_CHROME.emit(
					eventsToForwardToModuleChrome[eventName],
					eventData
				);
			}
		};
		return viewGenEventListener;
	};
	var viewGenEvents = this.viewGen.eventList;
	var viewGenEventKeys = Object.keys(viewGenEvents);
	var i;
	for(i = 0; i < viewGenEventKeys.length; i++) {
		var viewGenEventKey = viewGenEventKeys[i];
		var eventKey = viewGenEvents[viewGenEventKey];
		this.viewGen.on(
			eventKey,
			getViewGenEventListener(eventKey)
		);
	}

	var handleInitialDisplayScanResults = function(cachedScanResults) {
		var defered = q.defer();
		if(cachedScanResults.length > 0) {
			defered.resolve();
		} else {
			if(self.debug) {
				console.log('Performing Device Scan');
			}
			self.performDeviceScan()
			.then(defered.resolve, defered.reject);
		}
		return defered.promise;
	};
	var internalConnectToDevice = function(data) {
		var defered = q.defer();
		// var device = data.device;
		// var connectionType = data.connectionType;
		if(self.debug) {
			console.log('Connecting to a device', data);
		}
		var dt = data.connectionType.dt;
		var ct = data.connectionType.ct;

		var id;
		if(ct === driver_const.LJM_CT_USB) {
			id = data.device.serialNumber;
		} else {
			id = data.connectionType.ipAddress;
		}
		var openParams = {
			'deviceType': driver_const.DRIVER_DEVICE_TYPE_NAMES[dt],
			'connectionType': driver_const.DRIVER_CONNECTION_TYPE_NAMES[ct],
			'identifier': id,
			'mockDevice': data.device.isMockDevice
		};
		if(data.device.isMockDevice) {
			openParams.mockDeviceConfig = data.device;
		}
		if(allowDeviceControl) {
			device_controller.openDevice(openParams)
			.then(function(res) {
				if(self.debug) {
					console.log('Open Success', res);
				}
				device_controller.getDeviceListing()
				.then(function(deviceTypes) {
					if(self.debug) {
						console.log('Device Listing after open', deviceTypes);
					}
					self.emit(self.eventList.DEVICE_OPENED, data);
					defered.resolve(data);
				});
			}, function(err) {
				console.log('Error!!', typeof(err), err.toString());
				if(typeof(err) === 'number') {
					var errorInfo = modbus_map.getErrorInfo(err);
					var numStr = errorInfo.error.toString();
					var errorText = 'Failed to connect to the selected device';
					var description = '';
					if(errorInfo.description) {
						description = errorInfo.description.toLowerCase();
						errorText += ', ' + description;
					} else {
						errorText += '.';
					}
					var errorMessage = '<p>' + errorText + '<br>';
					errorMessage += 'LabJack error code: ';
					errorMessage += errorInfo.string + ' (' + numStr + ')</p>';
					
					showAlert(errorMessage);
				} else {
					console.error('Open Error', err, openParams);
				}
				defered.reject(data);

			});
		} else {
			defered.resolve(data);
		}
		return defered.promise;
	};
	var connectToDevice = function(data) {
		var defered = q.defer();

		internalConnectToDevice(data)
		.then(defered.resolve, defered.reject);
		return defered.promise;
	};
	var internalDisconnectFromDevice = function(data) {
		var defered = q.defer();
		// var device = data.device;
		// var connectionType = data.connectionType;
		if(self.debug) {
			console.log('Disconnecting from a device', data);
		}
		if(allowDeviceControl) {
			var dt = data.device.deviceType;
			var sn = data.device.serialNumber;
			var options = {
				'deviceType': dt,
				'serialNumber': sn,
			};
			device_controller.getDevice(options)
			.then(function(device) {
				if(device) {
					if(self.debug) {
						console.log('HERE, Closing device');
					}
					device.close()
					.then(function() {
						if(self.debug) {
							console.log('HERE, Closed Device');
						}
						self.emit(self.eventList.DEVICE_CLOSED, data);
						defered.resolve(data);
					});
				} else {
					console.error('Can not find device to close', options);
				}
			});
		} else {
			defered.resolve(data);
		}
		return defered.promise;
	};
	var disconnectFromDevice = function(data) {
		var defered = q.defer();

		internalDisconnectFromDevice(data)
		.then(defered.resolve, defered.reject);
		return defered.promise;
	};
	var startModule = function(newModule) {
		// console.log('device_selector starting', newModule.name, newModule.id);
		self.moduleData = newModule.data;
		
		// Cache the page elements
		self.viewGen.cachePageControlElements(newModule.data);

		// save device connection functions
		self.viewGen.saveDeviceControlFunctions(
			connectToDevice,
			disconnectFromDevice
		);

		// Load and display cached device scan results
		// getCachedListAllDevices()
		// .then(self.viewGen.displayScanResults)

		// Don't load and display the cached device scan results because they
		// don't currently  display devices that are open.  Force it to refresh.
		self.viewGen.displayScanResults([])
		.then(handleInitialDisplayScanResults)
		.then(function(scanResults) {
			// console.log('device_selector started');
			self.emit(self.eventList.MODULE_STARTED, scanResults);
			var data = {
				'name': self.moduleData.name,
			};
			MODULE_CHROME.emit('MODULE_READY', data);
			MODULE_LOADER.emit('MODULE_READY', data);
		}, function(err) {
			console.error('device_selector failed to start', err);
		});
	};
	var stopModule = function() {
		// console.log('device_selector stopped');
		self.emit(self.eventList.MODULE_STOPPED);
	};

	// Attach to MODULE_LOADER events that indicate to the module about what to
	// do.  (start/stop).
	var mlEvents = MODULE_LOADER.eventList;
	MODULE_LOADER.on(mlEvents.VIEW_READY, startModule);
	MODULE_LOADER.on(mlEvents.UNLOAD_MODULE, stopModule);
	var self = this;
};
util.inherits(createModuleInstance, EventEmitter);

var activeModule = new createModuleInstance();