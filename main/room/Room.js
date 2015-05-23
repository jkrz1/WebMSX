// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

function Room(screenElement, machinePanelElement, romProvided) {
    var self = this;

    function init() {
        buildPeripherals();
        buildAndPlugMachine(romProvided);
    }

    this.powerOn = function(paused) {

        TestMachine();

        setPageVisibilityHandling();
        self.screen.powerOn();
        if (self.machinePanel) this.machinePanel.powerOn();
        self.speaker.powerOn();
        self.keyboard.powerOn();
        insertRomProvidedIfNoneInserted();
        if (self.machine.getCartridgeSocket().inserted() && !self.console.powerIsOn) self.console.powerOn(paused);
    };

    this.powerOff = function() {
        self.machine.powerOff();
        self.keyboard.powerOff();
        self.speaker.powerOff();
        self.screen.powerOff();
        if (self.machinePanel) this.machinePanel.powerOff();
    };

    var insertRomProvidedIfNoneInserted = function() {
        //if (self.machine.getCartridgeSocket().inserted()) return;
        //if (cartridgeProvided) self.machine.getCartridgeSocket().insert(cartridgeProvided, false);
    };

    var setPageVisibilityHandling = function() {
        function visibilityChange() {
            if (document.hidden) self.speaker.mute();
            else self.speaker.play();
        }
        document.addEventListener("visibilitychange", visibilityChange);
    };

    var buildPeripherals = function() {
        self.stateMedia = new LocalStorageSaveStateMedia();
        self.romLoader = new ROMLoader();
        self.screen = new CanvasDisplay(screenElement);
        self.screen.connectPeripherals(self.romLoader, self.stateMedia);
        if (machinePanelElement) {
            self.machinePanel = new MachinePanel(machinePanelElement);
            self.machinePanel.connectPeripherals(self.screen, self.romLoader);
        }
        self.speaker = new WebAudioSpeaker();
        self.machineControls = new DOMMachineControls();
        self.machineControls.connectPeripherals(self.screen, self.machinePanel);
        self.keyboard = new DOMKeyboard();
        self.keyboard.connectPeripherals(self.screen, self.machinePanel);
    };

    var buildAndPlugMachine = function(rom) {
        self.machine = new Machine();
        self.stateMedia.connect(self.machine.getSavestateSocket());
        self.romLoader.connect(self.machine.getCartridgeSocket(), self.machine.getSavestateSocket());
        self.screen.connect(self.machine.getVideoOutput(), self.machine.getMachineControlsSocket(), self.machine.getCartridgeSocket());
        if (self.machinePanel) self.machinePanel.connect(self.machine.getMachineControlsSocket(), self.machine.getCartridgeSocket(), self.controls);
        self.speaker.connect(self.machine.getAudioOutput());
        self.machineControls.connect(self.machine.getMachineControlsSocket());
        self.keyboard.connect(self.machine.getKeyboardSocket());
    };


    this.machine = null;
    this.screen = null;
    this.machinePanel = null;
    this.speaker = null;
    this.machineControls = null;
    this.keyboard = null;
    this.stateMedia = null;
    this.romLoader = null;


    init();

}

