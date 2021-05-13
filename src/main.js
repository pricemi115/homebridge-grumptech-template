/* ==========================================================================
   File:               main.js
   Description:	       Homebridge integration for Template
   Copyright:          Mar 2021
   ========================================================================== */
'use strict';

const _debug = require('debug')('homebridge');
import * as modCrypto from 'crypto';
import { version as PLUGIN_VER }      from '../package.json';
import { config_info as CONFIG_INFO } from '../package.json';

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The import block below may seem like we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the import statement below MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * and used to access all exported variables and classes from HAP-NodeJS.
 */
/*
import {
    API,
    APIEvent,
    CharacteristicEventTypes,
    CharacteristicSetCallback,
    CharacteristicValue,
    DynamicPlatformPlugin,
    HAP,
    Logging,
    PlatformAccessory,
    PlatformAccessoryEvent,
    PlatformConfig,
  } from "homebridge";
*/

// Internal dependencies

// Configuration constants.
const ACCESSORY_VERSION = 1;
const PLUGIN_NAME       = CONFIG_INFO.plugin;
const PLATFORM_NAME     = CONFIG_INFO.platform;

// Internal Constants
const DEFAULT_PING_COUNT            = 5;

// Accessory must be created from PlatformAccessory Constructor
let _PlatformAccessory  = undefined;
// Service and Characteristic are from hap-nodejs
let _hap                = undefined;

/* Default Export Function for integrating with Homebridge */
/* ========================================================================
   Description: Exported default function for Homebridge integration.

   Parameters:  homebridge: reference to the Homebridge API.

   Return:      None
   ======================================================================== */
export default (homebridgeAPI) => {
    _debug(`homebridge API version: v${homebridgeAPI.version}`);

    // Accessory must be created from PlatformAccessory Constructor
    _PlatformAccessory  = homebridgeAPI.platformAccessory;
    if (!_PlatformAccessory.hasOwnProperty('PlatformAccessoryEvent')) {
        // Append the PlatformAccessoryEvent.IDENTITY enum to the platform accessory reference.
        // This allows us to not need to import anything from 'homebridge'.
        const platformAccessoryEvent = {
            IDENTIFY: "identify",
        }

        _PlatformAccessory.PlatformAccessoryEvent = platformAccessoryEvent;
    }

    // Cache the reference to hap-nodejs
    _hap                = homebridgeAPI.hap;

    // Register the paltform.
    _debug(`Registering platform: ${PLATFORM_NAME}`);
    homebridgeAPI.registerPlatform(PLATFORM_NAME, HomebridgePlatformPlugin);
};

/* ==========================================================================
   Class:              HomebridgePlatformPlugin
   Description:	       Homebridge platform for managing the plugin
   Copyright:          Mar 2021
   ========================================================================== */
class HomebridgePlatformPlugin {
 /* ========================================================================
    Description:    Constructor

    @param {object} [log]      - Object for logging in the Homebridge Context
    @param {object} [config]   - Object for the platform configuration (from config.json)
    @param {object} [api]      - Object for the Homebridge API.

    @return {object}  - Instance of VolumeInterrogatorPlatform

    @throws {<Exception Type>}  - <Exception Description>
    ======================================================================== */
    constructor(log, config, api) {

        /* Cache the arguments. */
        this._log     = log;
        this._config  = config;
        this._api     = api;

        /* My local data */
        this._name = this._config['name'];

        /* Bind Handlers */
        this._bindDoInitialization          = this._doInitialization.bind(this);
        this._bindDestructorNormal          = this._destructor.bind(this, {cleanup:true});
        this._bindDestructorAbnormal        = this._destructor.bind(this, {exit:true});

        /* Log our creation */
        this._log(`Creating HomebridgePlatformPlugin`);

        /* Create an empty map for our accessories */
        this._accessories = new Map();

        // Register for the Did Finish Launching event
        this._api.on('didFinishLaunching', this._bindDoInitialization);
        this._api.on('shutdown', this._bindDestructorNormal);

        // Register for shutdown events.
        //do something when app is closing
        process.on('exit', this._bindDestructorNormal);
        //catches uncaught exceptions
        process.on('uncaughtException', this._bindDestructorAbnormal);

    }

 /* ========================================================================
    Description: Destructor

    @param {object} [options]  - Typically containing a "cleanup" or "exit" member.
    @param {object} [err]      - The source of the event trigger.
    ======================================================================== */
    async _destructor(options, err) {
        // Is there an indication that the system is either exiting or needs to
        // be cleaned up?
        if ((options.exit) || (options.cleanup)) {
            // Cleanup the network performance objects.
        }
        // Lastly eliminate myself.
        delete this;
    }

 /* ========================================================================
    Description: Event handler when the system has loaded the platform.

    @throws {TypeError}  - thrown if the 'polling_interval' configuration item is not a number.
    @throws {RangeError} - thrown if the 'polling_interval' configuration item is outside the allowed bounds.

    @remarks:     Opportunity to initialize the system and publish accessories.
    ======================================================================== */
    async _doInitialization() {

        this._log(`Homebridge Plug-In ${PLATFORM_NAME} has finished launching.`);

        // Update/Flush any accessories that are not from this version
        for (const accessory of this._accessories.values()) {
            if (!accessory.context.hasOwnProperty('VERSION') ||
                (accessory.context.VERSION !== ACCESSORY_VERSION)) {
                // This accessory needs to be replaced.
                this._upgradeAccessory(accessory);
            }
        }

        let theSettings = undefined;
        if (this._config.hasOwnProperty('settings')) {
            // Get the system configuration,
            theSettings = this._config.settings;
        }

        // Check for Settings
        if (theSettings != undefined) {
        }

        // If we did not restore any accessories, create a dummy switch to play with.
        const theAccessoryName = "Dummy";
        let theAccessory = null;
        if (this._accessories.size == 0)
        {
            // Dummy switch never existed. Make one now.
            // uuid must be generated from a unique but not changing data source, theName should not be used in the most cases. But works in this specific example.
            const uuid = _hap.uuid.generate(theAccessoryName.toUpperCase());
            theAccessory = new _PlatformAccessory(theAccessoryName, uuid);
            // Create our services.
            theAccessory.addService(_hap.Service.Switch, theAccessoryName);

            // Add unique id and accessory version to the context/.
            theAccessory.context.ID         = modCrypto.createHash('sha256');
            theAccessory.context.VERSION    = ACCESSORY_VERSION;

            // register the manual refresh switch
            this._api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [theAccessory]);
        }
        else {
            theAccessory = this._accessories.get(theAccessoryName);
        }
        // configure this accessory.
        this._configureAccessory(theAccessory);
        // Update the accessory information.
        this._updateAccessoryInfo(theAccessory, {model:'dummy switch', serialnum:'00000001'});

    }

 /* ========================================================================
    Description: Homebridge API invoked after restoring cached accessorues from disk.

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory
    ======================================================================== */
    configureAccessory(accessory) {

        // Ensure we do not know this accessory before configuring and registering it.
        let found = false;
        for (const acc of this._accessories.values()) {
            if (acc === accessory) {
                found = true;
                break;
            }
        }
        if (!found) {
            // Configure the accessory (also registers it.)
            this._configureAccessory(accessory);
        }
    }

 /* ========================================================================
    Description: Internal function to perform accessory configuration and internal 'registration' (appending to our list)

    @throws {TypeError} - thrown if 'accessory' is not a PlatformAccessory

    @remarks:     Opportunity to setup event handlers for characteristics and update values (as needed).
    ======================================================================== */
    _configureAccessory(accessory) {

        if ((accessory === undefined) ||
            (!(accessory instanceof _PlatformAccessory))) {
            throw new TypeError(`accessory must be a PlatformAccessory`);
        }

        this._log.debug("Configuring accessory %s", accessory.displayName);

        // Get the accessory identifier from the contect.
        const id = accessory.context.ID;

        // Register to handle the Identify request for the accessory.
        accessory.on(_PlatformAccessory.PlatformAccessoryEvent.IDENTIFY, () => {
            this._log("%s identified!", accessory.displayName);
        });

        // Does this accessory have a Switch service?
        const serviceSwitch = accessory.getService(_hap.Service.Switch);
        if (serviceSwitch !== undefined) {
            const charOn = serviceSwitch.getCharacteristic(_hap.Characteristic.On);
            // Register for the "get" event notification.
            charOn.on('get', this._handleOnGet.bind(this, accessory));
            // Register for the "get" event notification.
            charOn.on('set', this._handleOnSet.bind(this, accessory));
        }

        // Update the accessory information
        this._updateAccessoryInfo(accessory, {model:"GrumpTech Homebridge Template", serialnum:id});

        // Is this accessory new to us?
        if (!this._accessories.has(id)){
            // Update our accessory listing
            this._log.debug(`Adding accessory '${accessory.displayName} to the accessories list. Count:${this._accessories.size}`);
            this._accessories.set(id, accessory);
        }
    }

 /* ========================================================================
    Description: Remove/destroy an accessory

    @param {object} [accessory] - accessory to be removed.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory.
    @throws {RangeError} - Thrown when a 'accessory' is not registered.
    ======================================================================== */
    _removeAccessory(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }
        if (!this._accessories.has(accessory.displayName)) {
            throw new RangeError(`Accessory '${accessory.displayName}' is not registered.`);
        }

        this._log.debug(`Removing accessory '${accessory.displayName}'`);

        // Event Handler cleanup.
        accessory.removeAllListeners(_PlatformAccessory.PlatformAccessoryEvent.IDENTIFY);
        // Does this accessory have a Switch service?
        const serviceSwitch = accessory.getService(_hap.Service.Switch);
        if (serviceSwitch !== undefined) {
            const charOn = serviceSwitch.getCharacteristic(_hap.Characteristic.On);
            // Register for the "get" event notification.
            charOn.off('get', this._handleOnGet.bind(this, accessory));
            // Register for the "get" event notification.
            charOn.off('set', this._handleOnSet.bind(this, accessory));
        }

        /* Unregister the accessory */
        this._api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        /* remove the accessory from our mapping */
        this._accessories.delete(accessory.displayName);
    }

 /* ========================================================================
    Description: Removes all of the `Battery Service` platform accessories.

    @param {bool} [removeAll] - Flag indicating if all accessories should be
                                removed, or only accessories with a Battery Service.
                                ** Not used in this template **
    ======================================================================== */
    _removeAccessories(removeAll) {

        this._log.debug(`Removing Accessories: removeAll:${removeAll}`);

        // Delete each of the registered accessories, but do so via the _removeAccessory()
        // function to unregister event handlers, etc.
        for (const accessory of this._accessories.values()) {
            his._removeAccessory(accessory);
        }
    }

 /* ========================================================================
    Description: Removes all of the `Battery Service` platform accessories.

    @param {object} [accessory] - accessory to be up/downgraded.
    ======================================================================== */
    _upgradeAccessories(accessory) {

        this._log.debug(`Removing Accessories: removeAll:${removeAll}`);

        if (!accessory.context.hasOwnProperty('VERSION') ||
        (accessory.context.VERSION !== ACCESSORY_VERSION)) {
            // By default, just remove the accessory and it will be re-created as needed.
            this._removeAccessory(accessory);
        }
    }

 /* ========================================================================
    Description: Update an accessory

    @param {object} [accessory] - accessory to be updated.

    @param {object} [info]                      - accessory information.
    @param {string | Error} [info.model]        - accessory model number
    @param {string | Error} [info.serialnum]    - accessory serial number.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    @throws {TypeError} - Thrown when 'info' is not undefined, does not have the 'model' or 'serialnum' properties
                          or the properties are not of the expected type.
    ======================================================================== */
    _updateAccessoryInfo(accessory, info) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }
        if ((info === undefined) ||
            (!info.hasOwnProperty('model'))     || ((typeof(info.model)      !== 'string') || (info.model instanceof Error)) ||
            (!info.hasOwnProperty('serialnum')) || ((typeof(info.serialnum)  !== 'string') || (info.serialnum instanceof Error))   ) {
            throw new TypeError(`info must be an object with properties named 'model' and 'serialnum' that are eother strings or Error`);
        }

        /* Get the accessory info service. */
        const accessoryInfoService = accessory.getService(_hap.Service.AccessoryInformation);
        if (accessoryInfoService != undefined)
        {
            /* Manufacturer */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Manufacturer, `GrumpTech`);

            /* Model */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.Model, info.model);

            /* Serial Number */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.SerialNumber, info.serialnum);

            /* Software Version */
            accessoryInfoService.updateCharacteristic(_hap.Characteristic.SoftwareRevision, `v${accessory.context.VERSION}`);
        }
    }

 /* ========================================================================
    Description: Event handler for the "get" event for the Switch.On characteristic.

    @param {object} [accessory] - accessory being querried.

    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    ======================================================================== */
    _handleOnGet(accessory, callback) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        this._log.info(`Switch '${accessory.displayName}' Get Request.`);

        let status = null;
        let result = undefined;
        try {
            result = this._getAccessorySwitchState(accessory);
            this._log.info(`Switch '${accessory.displayName}' is in state: ${result}`);
        }
        catch (err) {
            this._log.debug(`  Unexpected error encountered: ${err.message}`);
            result = false;
            status = new Error(`Accessory ${accessory.displayName} is not ressponding.`);
        }

        // Invoke the callback function with our result.
        callback(status, result);
    }

 /* ========================================================================
    Description: Event handler for the "set" event for the Switch.On characteristic.

    @param {object} [accessory] - accessory being querried.
    @param {bool} [value]           - new/rewuested state of the switch
    @param {function} [callback] - Function callback for homebridge.

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    ======================================================================== */
    _handleOnSet(accessory, value, callback) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        this._log.info(`Switch '${accessory.displayName}' Set Request. New state:${value}`);

        let status = null;

        callback(status);
    }

 /* ========================================================================
    Description: Get the value of the Service.Switch.On characteristic value

    @param {object} [accessory] - accessory being querried.

    @return - the value of the On characteristic (true or false)

    @throws {TypeError} - Thrown when 'accessory' is not an instance of _PlatformAccessory..
    @throws {Error}     - Thrown when the switch service or On characteristic cannot
                          be found on the accessory.
    ======================================================================== */
    _getAccessorySwitchState(accessory) {
        // Validate arguments
        if ((accessory === undefined) || !(accessory instanceof _PlatformAccessory)) {
            throw new TypeError(`Accessory must be a PlatformAccessory`);
        }

        let result = false;
        const serviceSwitch = accessory.getService(_hap.Service.Switch);
        if (serviceSwitch !== undefined) {
            const charOn = serviceSwitch.getCharacteristic(_hap.Characteristic.On);
            if (charOn !== undefined) {
                result = charOn.value;
            }
            else {
                throw new Error(`The Switch service of accessory ${accessory.displayName} does not have an On charactristic.`);
            }
        }
        else {
            throw new Error(`Accessory ${accessory.displayName} does not have a Switch service.`);
        }

        return result;
    }
}
