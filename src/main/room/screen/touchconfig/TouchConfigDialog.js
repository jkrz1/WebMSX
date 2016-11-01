// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

wmsx.TouchConfigDialog = function(mainElement, controllersHub) {
    "use strict";

    var self = this;

    this.show = function () {
        if (!dialog) {
            create();
            return setTimeout(self.show, 0);
        }

        visible = true;
        dialog.classList.add("wmsx-show");
        dialog.focus();
        editing = null;
        touchControls.startTouchDetection(self);
        refresh();
        refreshMode();
    };

    this.hide = function() {
        touchControls.stopTouchDetection(self);
        WMSX.userPreferences.save();
        dialog.classList.remove("wmsx-show");
        visible = false;
        WMSX.room.screen.focus();
    };

    this.touchControlDetected = function(control) {
        editing = control;
        refresh();
    };

    this.controllersSettingsStateUpdate = function() {
        if (visible) refreshMode();
    };

    function refresh() {
        if (editing === "T_DIR") {
            directional.classList.add("wmsx-show");
            button.classList.remove("wmsx-show");
            wmsx.DOMTouchControls.styleDirectionalMapping(directional, prefs.directional);
        } else {
            button.classList.add("wmsx-show");
            directional.classList.remove("wmsx-show");
            wmsx.DOMTouchControls.styleButtonMapping(button, prefs.buttons[editing]);
        }
    }

    function refreshMode() {
        p1.classList.remove("wmsx-selected");
        p2.classList.remove("wmsx-selected");
        off.classList.remove("wmsx-selected");

        var state = controllersHub.getSettingsState();
        var port = state.touchPortSet;

        if (port >= 0) {
            var butPort = port === 1 ? p2 : p1;
            butPort.classList.add("wmsx-selected");
            var active = state.touchActive;   // Really active at port
            butPort.classList.toggle("wmsx-selected-inactive", !active);
            off.classList.toggle("wmsx-selected", !active);
        } else
            off.classList.add("wmsx-selected");
    }

    function create() {
        dialog = document.createElement("div");
        dialog.id = "wmsx-touch-config";
        dialog.tabIndex = -1;

        header = document.createElement("div");
        header.innerHTML = "Tap Control<br>to modify mapping";
        dialog.appendChild(header);

        minus = document.createElement("div");
        minus.id = "wmsx-touch-config-minus";
        dialog.appendChild(minus);

        plus = document.createElement("div");
        plus.id = "wmsx-touch-config-plus";
        dialog.appendChild(plus);

        directional = wmsx.DOMTouchControls.createDirectional("wmsx-touch-config-dir");
        dialog.appendChild(directional);

        button = wmsx.DOMTouchControls.createButton("wmsx-touch-config-button");
        dialog.appendChild(button);

        p1 =  createModeButton("p1");
        p2 =  createModeButton("p2");
        off = createModeButton("off");

        setupEvents();

        mainElement.appendChild(dialog);

        dirSequence = [ "JOYSTICK", "KEYBOARD"];

        buttonSequence = [ null ];
        buttonSequence.push(wmsx.JoystickButtons.J_A.button);
        buttonSequence.push(wmsx.JoystickButtons.J_B.button);
        buttonSequence.push(wmsx.JoystickButtons.J_AB.button);
        for (var k in wmsx.KeyboardKeys) buttonSequence.push(k);

        function createModeButton(mode) {
            var but = document.createElement('div');
            but.id = "wmsx-touch-config-" + mode;
            but.innerHTML = mode.toUpperCase();
            but.wmsxMode = mode;
            but.addEventListener("touchstart", modeButtonClicked);
            but.addEventListener("mousedown", modeButtonClicked);
            dialog.appendChild(but);
            return but;
        }
    }

    function modifyControl(inc) {
        if (!editing) return;
        var isDirectional = editing === "T_DIR";
        var sequence = isDirectional ? dirSequence : buttonSequence;
        var mapping = isDirectional ? prefs.directional : prefs.buttons[editing];
        var curButton = isDirectional ? mapping : mapping && (mapping.button || mapping.key);
        var curIdx = wmsx.Util.arrayFindIndex(sequence, function (x) {
            return x === curButton
        });
        var newIdx = curIdx + inc;
        if (newIdx < 0) newIdx = 0; else if (newIdx >= sequence.length) newIdx = sequence.length - 1;
        var newMapping = sequence[newIdx];
        if (!isDirectional) newMapping = newMapping && (wmsx.JoystickButtons[newMapping] || wmsx.KeyboardKeys[newMapping]);
        touchControls.customizeControl(editing, newMapping);
        refresh();
    }

    function setupEvents() {
        // Trap keys, respond to some
        dialog.addEventListener("keydown", function(e) {
            e.preventDefault();
            e.stopPropagation();

            // Abort
            if (e.keyCode === ESC_KEY) self.hide();
            // Confirm
            else if (CONFIRM_KEYS.indexOf(e.keyCode) >= 0) self.hide();
            // Select
            else if (SELECT_KEYS[e.keyCode]) modifyControl(SELECT_KEYS[e.keyCode]);

            return false;
        });

        // Hide on lost focus
        if ("onblur" in document) dialog.addEventListener("blur", self.hide, true);
        else dialog.addEventListener("focusout", self.hide, true);

        // Supress context menu
        dialog.addEventListener("contextmenu", function stopContextMenu(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });

        // Clicking arrow buttons modify control
        minus.addEventListener("touchstart", function(e) { modifyButtonPressed(e, -1); });
        minus.addEventListener("mousedown",  function(e) { modifyButtonPressed(e, -1); });
        plus. addEventListener("touchstart", function(e) { modifyButtonPressed(e, +1); });
        plus. addEventListener("mousedown",  function(e) { modifyButtonPressed(e, +1); });
        minus.addEventListener("touchend", modifyButtonReleased);
        minus.addEventListener("mouseup",  modifyButtonReleased);
        plus. addEventListener("touchend", modifyButtonReleased);
        plus. addEventListener("mouseup",  modifyButtonReleased);
    }

    function modifyButtonPressed(e, inc) {
        modifyButtonReleased(e);
        modifyControl(inc);
        modifyKeyTimeout = setTimeout(function repeat() {
            modifyControl(inc);
            modifyKeyTimeout = setTimeout(repeat, 50);
        }, 500);
    }

    function modifyButtonReleased(e) {
        e.preventDefault();
        e.stopPropagation();
        if (modifyKeyTimeout) clearTimeout(modifyKeyTimeout);
    }

    function modeButtonClicked(e) {
        var mode = e.target.wmsxMode;
        var modeNum = mode === "p1" ? 0 : mode === "p2" ? 1 : -1;
        touchControls.setMode(modeNum);
    }


    var visible = false;
    var dialog, header, directional, button, minus, plus, p1, p2, off;

    var editing = null;
    var modifyKeyTimeout;
    var dirSequence, buttonSequence;

    var prefs = WMSX.userPreferences.current.touch;
    var touchControls = controllersHub.getTouchControls();

    var k = wmsx.DOMKeys;
    var ESC_KEY = k.VK_ESCAPE.c;
    var CONFIRM_KEYS = [ k.VK_ENTER.c, k.VK_SPACE.c ];
    var SELECT_KEYS = {};
    SELECT_KEYS[k.VK_LEFT.c] = -1;
    SELECT_KEYS[k.VK_RIGHT.c] = 1;

};