// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

wmsx.FileLoader = function() {
    var self = this;

    this.connect = function(pMachine) {
        machine = pMachine;
        slotSocket = machine.getSlotSocket();
        biosSocket = machine.getBIOSSocket();
        machine.getExtensionsSocket().connectFileLoader(this);
        expansionSocket = machine.getExpansionSocket();
        cartridgeSocket = machine.getCartridgeSocket();
        saveStateSocket = machine.getSavestateSocket();
    };

    this.connectPeripherals = function(pCassetteDeck, pDiskDrive) {
        cassetteDeck = pCassetteDeck;
        diskDrive = pDiskDrive;
    };

    this.registerForDnD = function (element) {
        element.addEventListener("dragover", onDragOver, false);
        element.addEventListener("drop", onDrop, false);
    };

    this.registerForFileInputElement = function (element) {
        fileInputElementParent = element;
    };

    this.openFileChooserDialog = function (openType, altPower, inSecondaryPort) {
        if (!fileInputElement) createFileInputElement();
        fileInputElement.multiple = INPUT_MULTI[OPEN_TYPE[openType] || OPEN_TYPE.ALL];
        fileInputElement.accept = INPUT_ACCEPT[OPEN_TYPE[openType] || OPEN_TYPE.ALL];

        chooserOpenType = openType;
        chooserPort = inSecondaryPort ? 1 : 0;
        chooserAltPower = altPower;
        chooserAsExpansion = false;     // No means to load expansion via chooser for now
        fileInputElement.click();
    };

    this.openURLChooserDialog = function (openType, altPower, inSecondaryPort, asExpansion) {
        var port = inSecondaryPort ? 1 : 0;
        var url;
        try {
            url = localStorage && localStorage[LOCAL_STORAGE_LAST_URL_KEY];
        } catch (e) {
            // give up
        }

        var wasPaused = machine.systemPause(true);

        url = prompt("Load file from URL:", url || "");
        url = url && url.toString().trim();

        if (url) {
            try {
                localStorage[LOCAL_STORAGE_LAST_URL_KEY] = url;
            } catch (e) {
                // give up
            }
            this.readFromURL(url, openType, port, altPower, asExpansion, function (s) {
                if (!wasPaused) machine.systemPause(false);
            });
        } else {
            if (!wasPaused) machine.systemPause(false);
        }
    };

    this.readFromFile = function (file, openType, port, altPower, asExpansion, then) {      // Auto detects type
        wmsx.Util.log("Reading file: " + file.name);
        var reader = new FileReader();
        reader.onload = function (event) {
            var content = new Uint8Array(event.target.result);
            if (openType === OPEN_TYPE.AUTO_AS_DISK || openType === OPEN_TYPE.FILES_AS_DISK || openType === OPEN_TYPE.ZIP_AS_DISK) {
                var aFile = { name: file.name, content: content, lastModifiedDate: file.lastModifiedDate };
                self.loadFileAsDisk(aFile, openType, port, altPower);
            } else {
                self.loadContentAsMedia(file.name, content, openType, port || 0, altPower, asExpansion);
            }
            if (then) then(true);
        };
        reader.onerror = function (event) {
            showError("File reading error: " + event.target.error.name + DIR_NOT_SUPPORTED_HINT);     // Directories not supported
            if (then) then(false);
        };

        reader.readAsArrayBuffer(file);
    };

    this.readFromFiles = function (files, openType, port, altPower, asExpansion, then) {   // Files as Disk only
        var reader = new wmsx.MultiFileReader(files,
            function onSuccessAll(files) {
                // Sort files by name
                files = Array.prototype.slice.call(files);
                files.sort(function sortFiles(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });

                if (openType === OPEN_TYPE.AUTO_AS_DISK || openType === OPEN_TYPE.FILES_AS_DISK)
                    self.loadFilesAsDisk(files, port, altPower);
                else
                    self.loadFilesAsMedia("Files", files, openType, port, altPower, asExpansion, false);
                if (then) then(true);
            },
            function onFirstError(files, error, known) {
                if (!known) error += DIR_NOT_SUPPORTED_HINT;                  // Directories not supported
                showError("File reading error: " + error);
                if (then) then(false);
            },
            null
        );
        reader.start();
    };

    this.readFromURL = function (url, openType, port, altPower, asExpansion, then) {
        new wmsx.MultiDownloader([{
            url: url,
            onSuccess: function (res) {
                if (openType === OPEN_TYPE.FILES_AS_DISK || openType === OPEN_TYPE.ZIP_AS_DISK || openType === OPEN_TYPE.AUTO_AS_DISK) {
                    var file = { name: url, content: res.content };
                    self.loadFileAsDisk(file, openType, port, altPower);
                } else {
                    self.loadContentAsMedia(url, res.content, openType, port || 0, altPower, asExpansion);
                }
                if (then) then(true);
            },
            onError: function (res) {
                showError("URL reading error: " + res.error);
                if (then) then(false);
            }
        }]).start();
    };

    this.loadContentAsMedia = function (name, content, openType, port, altPower, asExpansion) {
        openType = OPEN_TYPE[openType] || OPEN_TYPE.ALL;

        var zip = wmsx.Util.checkContentIsZIP(content);
        if (zip) {
            if (loadZipAsMedia(name, zip, openType, port, altPower, asExpansion)) return;
            showError("No valid " + TYPE_DESC[openType] + " detected in ZIP file!");
        } else {
            if (loadSingleContentAsMedia(name, content, openType, port, altPower, asExpansion)) return;
            showError("No valid " + TYPE_DESC[openType] + " detected!");
        }
    };

    function loadZipAsMedia (name, zip, openType, port, altPower, asExpansion) {
        try {
            var files = zip.file(/.+/);
            // Try as a Disk Stack (load all images found in ZIP)
            if (openType === OPEN_TYPE.DISK || openType === OPEN_TYPE.ALL)
                if (diskDrive.loadDiskStackFromFiles(port, name, files, altPower, openType === OPEN_TYPE.DISK, true)) return true;
            // Try as other Single media
            for (var i = 0; i < files.length; i++)
                if (loadSingleContentAsMedia(name, files[i].asUint8Array(), openType, port, altPower, asExpansion)) return true;
            // Finally load ZIP as Disk if allowed
            if (openType === OPEN_TYPE.ALL)
                if (self.loadZipAsDisk(name, zip, port, altPower)) return true;
        } catch(ez) {
            console.log(ez.stack);      // Error decompressing files. Abort
        }
        return false;
    }

    function loadSingleContentAsMedia(name, content, openType, port, altPower, asExpansion) {
        // Try as Single Disk
        if (openType === OPEN_TYPE.DISK || openType === OPEN_TYPE.ALL)
            if (diskDrive.loadDiskStackFromFiles(port, name, [ { name: name, content: content } ], altPower, openType === OPEN_TYPE.DISK, false)) return true;
        // Try as Cassette file
        if (openType === OPEN_TYPE.TAPE || openType === OPEN_TYPE.ALL)
            if (cassetteDeck.loadTapeFile(name, content, altPower)) return true;
        // Try as a SaveState file
        if (openType === OPEN_TYPE.STATE || openType === OPEN_TYPE.ALL)
            if (saveStateSocket.loadStateFile(content)) return true;
        // Try as Cartridge Data (SRAM, etc)
        if (openType === OPEN_TYPE.CART_DATA || openType === OPEN_TYPE.ALL)
            if (cartridgeSocket.loadCartridgeData(port, name, content)) return true;
        // Try to load as ROM (BIOS or Cartridge)
        if (openType === OPEN_TYPE.ROM || openType === OPEN_TYPE.ALL) {
            var slot = wmsx.SlotCreator.createFromROM(new wmsx.ROM(name, content));
            if (slot) {
                if (slot.format === wmsx.SlotFormats.BIOS) biosSocket.insert(slot, altPower);
                else if (asExpansion) expansionSocket.insert(slot, port, altPower);
                else cartridgeSocket.insert(slot, port, altPower);
                return true;
            }
        }
        // Not a valid content
        return false;
    }

    this.loadFilesAsMedia = function (name, files, openType, port, altPower, asExpansion, filesFromZIP) {
        // Try as a Disk Stack (all images found)
        if (openType === OPEN_TYPE.DISK || openType === OPEN_TYPE.ALL)
            if (diskDrive.loadDiskStackFromFiles(port, name, files, altPower, openType === OPEN_TYPE.DISK, true)) return true;
        // Try as other Single media (first found)
        if (openType !== OPEN_TYPE.DISK && openType !== OPEN_TYPE.AUTO_AS_DISK && openType !== OPEN_TYPE.FILES_AS_DISK && openType !== OPEN_TYPE.ZIP_AS_DISK)
            for (var i = 0; i < files.length; i++)
                if (tryLoadSingleContentAsMedia(name, files[i].asUint8Array(), openType, port, altPower, asExpansion)) return true;
        // Finally load Files as Disk if allowed
        if (openType === OPEN_TYPE.AUTO_AS_DISK || openType === OPEN_TYPE.FILES_AS_DISK || openType === OPEN_TYPE.ALL)
            return self.loadFilesAsDisk(files, port, altPower);
    };


    this.loadContentAsSlot = function (name, content, slotPos, altPower) {      // Used only by Launcher
        var zip = wmsx.Util.checkContentIsZIP(content);
        if (zip) {
            if (loadZipAsSlot(zip, name, slotPos, altPower)) return;
            showError("No valid ROMs found in ZIP file");
        } else {
            if (loadSingleContentAsSlot(name, content, slotPos, altPower)) return;
            showError("Unsupported ROM file!");
        }
    };

    function loadZipAsSlot(zip, name, slotPos, altPower) {
        try {
            var files = zip.file(/.+/);
            for (var i = 0; i < files.length; i++)
                if (loadSingleContentAsSlot(name, files[i].asUint8Array(), slotPos, altPower)) return true;
        } catch (ez) {
            console.log(ez.stack);      // Error decompressing files. Abort
        }
        return false;
    }

    function loadSingleContentAsSlot(name, content, slotPos, altPower) {
        var slot = wmsx.SlotCreator.createFromROM(new wmsx.ROM(name, content));
        if (!slot) return false;
        slotSocket.insert(slot, slotPos, altPower);
        return true;
    }

    this.loadFileAsDisk = function (file, openType, port, altPower) {
        // Try as ZIP as Disk if type allows
        var mes;
        var zip = wmsx.Util.checkContentIsZIP(file.content);
        if (zip && (openType === OPEN_TYPE.ZIP_AS_DISK || openType === OPEN_TYPE.AUTO_AS_DISK)) {
            try {
                if (this.loadZipAsDisk(file.name, zip, port, altPower)) return;     // throws exception
            } catch (ex) {
                // Error decompressing or loading. Probably not a zip file.
                console.log(ex.stack);
                if (ex.wmsx) mes = ex.message;
            }
        } else
            mes = "Not a ZIP File!";
        // Fail now if only ZIP loading asked
        if (openType === OPEN_TYPE.ZIP_AS_DISK)
            return showError("Unsupported " + TYPE_DESC[OPEN_TYPE.ZIP_AS_DISK] + " load!" + (mes ? " " + mes : ""));
        // Try Files as Disk (only 1 file)
        this.loadFilesAsDisk([file], port, altPower);
    };

    this.loadFilesAsDisk = function (files, port, altPower) {
        try {
            diskDrive.loadAsDiskFromFiles(port, null, files, altPower, "Files");     // throws exception
        } catch(ex) {
            console.log(ex.stack);
            showError("Unsupported " + TYPE_DESC[OPEN_TYPE.FILES_AS_DISK] + " load!" + (ex.wmsx ? " " + ex.message : ""));
        }
    };

    this.loadZipAsDisk = function (name, zip, port, altPower) {     // throws exceptions
        return diskDrive.loadAsDiskFromFiles(port, name, createTreeFromZip(zip), altPower, "ZIP");    // throws exception
    };

    function createTreeFromZip(zip) {
        // Build file tree structure as required by image creator
        var rootDir = [];
        var dirs = zip.folder(/.+/).filter(function(f) { return f.dir && f.name; });         // get only directories first
        dirs.sort(function (a, b) {                                                          // sort dirs according to depth
            return wmsx.Util.stringCountOccurrences(a.name, "/") - wmsx.Util.stringCountOccurrences(b.name, "/");
        });
        for (var d = 0; d < dirs.length; ++d)
            createDir(dirs[d]);

        var files = zip.file(/.+/).filter(function(f) { return !f.dir && f.name; });         // get only real files
        for (var f = 0; f < files.length; ++f)
            putFile(files[f]);

        return rootDir;

        function createDir(newDir) {
            var parts = newDir.name.split("/");
            var dir = rootDir;
            for (var p = 0; p < parts.length - 2; ++p) {
                var part = parts[p];
                var subDir = dir.find(function(i) { return i.isDir && i.name == part; });
                if (!subDir) {
                    subDir = { isDir: true, name: part, items: [] };
                    dir.push(subDir);
                }
                dir = subDir.items;
            }
            newDir.isDir = true;
            newDir.name = parts[parts.length - 2];
            newDir.lastModifiedDate = newDir.date;
            newDir.items = [];
            dir.push(newDir);
        }

        function putFile(file) {
            var parts = file.name.split("/");
            var dir = rootDir;
            for (var p = 0; p < parts.length - 1; ++p) {
                var part = parts[p];
                var subDir = dir.find(function(i) { return i.isDir && i.name == part; });
                if (!subDir) {
                    subDir = { isDir: true, name: part, items: [] };
                    dir.push(subDir);
                }
                dir = subDir.items;
            }
            file.isDir = false;
            file.name = parts[parts.length - 1];
            file.lastModifiedDate = file.date;
            file.content = file.asUint8Array();
            dir.push(file);
        }
    }

    var onFileInputChange = function(event) {
        event.returnValue = false;  // IE
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        event.target.focus();
        if (!this.files || this.files.length === 0) return;           // this will have a property "files"!

        var files = Array.prototype.slice.call(this.files);

        // Tries to clear the last selected file so the same file can be chosen
        try {
            fileInputElement.value = "";
        } catch (e) {
            // Ignore
        }

        var wasPaused = machine.systemPause(true);
        var resume = function (s) {
            if (!wasPaused) machine.systemPause(false);
        };

        if (files && files.length > 0) {
            if (files.length === 1)
                self.readFromFile(files[0], chooserOpenType, chooserPort, chooserAltPower, chooserAsExpansion, resume);
            else
                self.readFromFiles(files, chooserOpenType, chooserPort, chooserAltPower, chooserAsExpansion, resume);
        }

        return false;
    };

    var onDragOver = function (event) {
        event.returnValue = false;  // IE
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();

        if (WMSX.MEDIA_CHANGE_DISABLED)
            event.dataTransfer.dropEffect = "none";
        else
            event.dataTransfer.dropEffect = "link";

        dragButtons = event.buttons > 0 ? event.buttons : MOUSE_BUT1_MASK;      // If buttons not supported, consider it a left-click
    };

    var onDrop = function (event) {
        event.returnValue = false;  // IE
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        event.target.focus();

        if (WMSX.MEDIA_CHANGE_DISABLED) return;
        if (!event.dataTransfer) return;

        var wasPaused = machine.systemPause(true);

        var port = event.shiftKey ? 1 : 0;
        var altPower = dragButtons & MOUSE_BUT2_MASK;
        var asExpansion = event.altKey;
        var forceAsDisk = event.ctrlKey;

        var openType = forceAsDisk ? OPEN_TYPE.AUTO_AS_DISK : OPEN_TYPE.ALL;

        // Try to get local file/files if present
        var files = event.dataTransfer && event.dataTransfer.files;
        var resume = function (s) {
            if (!wasPaused) machine.systemPause(false);
        };
        if (files && files.length > 0) {
            if (files.length === 1)
                self.readFromFile(files[0], openType, port, altPower, asExpansion, resume);
            else
                self.readFromFiles(files, openType, port, altPower, asExpansion, resume);
        } else {
            // If not, try to get URL
            var url = event.dataTransfer.getData("text");
            if (url && url.length > 0)
                self.readFromURL(url, null, port, altPower, asExpansion, resume);
        }
    };

    var showError = function(message) {
        wmsx.Util.log("" + message);
        wmsx.Util.message("Could not load file(s):\n\n" + message + "\n");
    };

    var createFileInputElement = function () {
        fileInputElement = document.createElement("input");
        fileInputElement.id = "wmsx-file-loader-input";
        fileInputElement.type = "file";
        fileInputElement.multiple = true;
        fileInputElement.accept = INPUT_ACCEPT.ALL;
        fileInputElement.style.display = "none";
        fileInputElement.addEventListener("change", onFileInputChange);
        fileInputElementParent.appendChild(fileInputElement);
    };

    var machine;
    var slotSocket;
    var biosSocket;
    var expansionSocket;
    var cartridgeSocket;
    var saveStateSocket;
    var cassetteDeck;
    var diskDrive;

    var fileInputElement;
    var fileInputElementParent;

    var chooserOpenType;
    var chooserPort = 0;
    var chooserAltPower = false;
    var chooserAsExpansion = false;

    var dragButtons = 1;

    var MOUSE_BUT1_MASK = 1;
    var MOUSE_BUT2_MASK = 2;


    var OPEN_TYPE = wmsx.FileLoader.OPEN_TYPE;

    var ZIP_PATTERN = {
        ROM:   /^.+\.(bin|BIN|rom|ROM|bios|BIOS)$/,
        DISK:  /^.+\.(bin|BIN|dsk|DSK)$/,
        TAPE:  /^.+\.(bin|BIN|cas|CAS|tape|TAPE)$/,
        STATE: /^.+\.(wst|WST)$/,
        CART_DATA: /^.+\.(pac|PAC|dat|DAT|sram|SRAM)$/,
        FILES_AS_DISK: /.+/,
        ZIP_AS_DISK:   /.+/,
        AUTO_AS_DISK:  /.+/,
        ALL:   /.+/
    };

    var INPUT_ACCEPT = {
        ROM:   ".bin,.BIN,.rom,.ROM,.bios,.BIOS,.zip,.ZIP",
        DISK:  ".bin,.BIN,.dsk,.DSK,.zip,.ZIP",
        TAPE:  ".bin..BIN,.cas,.CAS,.tape,.TAPE,.zip,.ZIP",
        STATE: ".wst,.WST",
        CART_DATA: ".pac,.PAC,.dat,.DAT,.sram,.SRAM",
        FILES_AS_DISK: "",
        ZIP_AS_DISK:   ".zip,.ZIP",
        AUTO_AS_DISK:  "",
        ALL:   ".bin,.BIN,.dsk,.DSK,.rom,.ROM,.bios,.BIOS,.cas,.CAS,.tape,.TAPE,.wst,.WST,.zip,.ZIP"
    };

    var INPUT_MULTI = {
        ROM:   false,
        DISK:  true,
        TAPE:  false,
        STATE: false,
        CART_DATA: false,
        FILES_AS_DISK: true,
        ZIP_AS_DISK:   false,
        AUTO_AS_DISK:  true,
        ALL:   false
    };

    var TYPE_DESC = {
        ROM:   "ROM",
        DISK:  "Disk",
        TAPE:  "Cassette",
        STATE: "Savestate",
        CART_DATA: "Cartridge Data",
        FILES_AS_DISK: "Files as Disk",
        ZIP_AS_DISK:   "ZIP as Disk",
        AUTO_AS_DISK:  "Load as Disk",
        ALL:   "ROM, Cassette or Disk"
    };

    var LOCAL_STORAGE_LAST_URL_KEY = "wmsxlasturl";

    var DIR_NOT_SUPPORTED_HINT = '\n\nIMPORTANT: Directories are not supported for loading!\nPlease use "ZIP as Disk" loading for full directories support.';

    WMSX.fileLoader = this;

};

wmsx.FileLoader.OPEN_TYPE = { ROM: "ROM", DISK: "DISK", TAPE: "TAPE", STATE: "STATE", CART_DATA: "CART_DATA", FILES_AS_DISK: "FILES_AS_DISK", ZIP_AS_DISK: "ZIP_AS_DISK", AUTO_AS_DISK: "AUTO_AS_DISK", ALL: "ALL" };