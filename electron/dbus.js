'use strict';

const errorHandler = require('./error-handler');
const mainWinMod = require('./main-window');

// only optionally require dbus
let isDBusError = false;
let dbus;
try {
  dbus = require('dbus-native');
} catch (e) {
  console.log('NOTE: Continuing without DBUS');
  console.error(e);
  isDBusError = true;
}

const CONFIG = require('./CONFIG');
const serviceName = CONFIG.D_BUS_ID;

const interfaceName = serviceName;
const objectPath = '/' + serviceName.replace(/\./g, '/');

let sessionBus;
let ifaceDesc;
let iface;

function init(params) {
  sessionBus = dbus.sessionBus();

// Check the connection was successful
  if (!sessionBus) {
    isDBusError = true;
    errorHandler(`DBus: Could not connect to the DBus session bus.`);
  }

  sessionBus.requestName(serviceName, 0x4, (e, retCode) => {
    // If there was an error, warn user and fail
    if (e) {
      isDBusError = true;
      errorHandler(`DBus: Could not request service name ${serviceName}, the error was: ${e}.`);
    }

    // Return code 0x1 means we successfully had the name
    if (retCode === 1) {
      console.log(`Successfully requested service name '${serviceName}'!`)
      proceed();
    }
    /* Other return codes means various errors, check here
    (https://dbus.freedesktop.org/doc/api/html/group__DBusShared.html#ga37a9bc7c6eb11d212bf8d5e5ff3b50f9) for more
    information
    */
    else {
      isDBusError = true;
      errorHandler(`DBus: Failed to request service name '${serviceName}'.Check what return code '${retCode}' means.`);
    }
  });

// Function called when we have successfully got the service name we wanted
  function proceed() {
    // First, we need to create our interface description (here we will only expose method calls)
    ifaceDesc = {
      name: interfaceName,
      methods: {
        // Simple types
        markAsDone: [],
        startTask: [],
        pauseTask: [],
        showApp: [],
        quitApp: [],
      },
      properties: {},
      signals: {
        taskChanged: ['ss', 'task_id', 'task_text'],
        pomodoroUpdate: ['bxx', 'is_on_break', 'session_time_left', 'session_total_time'],
      },
    };

    function checkMainWin() {
      const mainWin = mainWinMod.getWin();
      if (!mainWin) {
        errorHandler('DBus: mainWin not ready');
      }
    }

    // Then we need to create the interface implementation (with actual functions)
    iface = {
      markAsDone: function() {
        checkMainWin();
        const mainWin = mainWinMod.getWin();
        mainWin.webContents.send('TASK_MARK_AS_DONE');
      },
      startTask: function() {
        checkMainWin();
        const mainWin = mainWinMod.getWin();
        mainWin.webContents.send('TASK_START');
      },
      pauseTask: function() {
        checkMainWin();
        const mainWin = mainWinMod.getWin();
        mainWin.webContents.send('TASK_PAUSE');
      },
      showApp: function() {
        params.showApp();
      },
      quitApp: function() {
        params.quitApp();
      },
      emit: function() {
        // no nothing, as usual
      }
    };

    // Now we need to actually export our interface on our object
    sessionBus.exportInterface(iface, objectPath, ifaceDesc);

    // Say our service is ready to receive function calls (you can use `gdbus call` to make function calls)
    console.log('Interface exposed to DBus, ready to receive function calls!');
  }
}

let isErrorShownOnce = false;

if (!isDBusError) {
  module.exports = {
    init: init,
    setTask: (taskId, taskText) => {
      // fail silently to prevent hundreds of error messages
      if (isDBusError || isErrorShownOnce) {
        return;
      }

      if (iface) {
        errorHandler('DBus: interface not ready yet');
        isErrorShownOnce = true;
      } else {
        iface.emit('taskChanged', taskId + '', taskText + '')
      }
    },
    updatePomodoro: (isOnBreak, currentSessionTime, currentSessionInitialTime) => {
      // fail silently to prevent hundreds of error messages
      if (isDBusError || isErrorShownOnce) {
        return;
      }

      if (iface) {
        iface.emit('pomodoroUpdate', (isOnBreak ? 1 : 0), currentSessionTime, currentSessionInitialTime)
      } else {
        errorHandler('DBus: interface not ready yet');
        isErrorShownOnce = true;
      }
    }
  };
} else {
  module.exports = {
    init: () => {
    },
    setTask: () => {
    },
    updatePomodoro: () => {
    }
  };
}
