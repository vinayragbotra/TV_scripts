// A simple polyfill for JSON stringify since ExtendScript lacks a native JSON object
var JSON_stringify = function(obj) {
    if (obj === null) return "null";
    if (typeof obj === "string") return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (obj instanceof Array) {
        var res = [];
        for (var i = 0; i < obj.length; i++) res.push(JSON_stringify(obj[i]));
        return "[" + res.join(",") + "]";
    }
    if (typeof obj === "object") {
        var res = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                res.push('"' + k + '":' + JSON_stringify(obj[k]));
            }
        }
        return "{" + res.join(",") + "}";
    }
    return '""';
};

function sendSelectedClips(isDetailed) {
    try {

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON_stringify({ success: false, message: "Please open a sequence and select the clips you want to track." });
        }

        var selectedClips = seq.getSelection();
        if (!selectedClips || selectedClips.length === 0) {
            return JSON_stringify({ success: false, message: "No clips are currently selected in your timeline." });
        }

        var clipDataList = [];
        for (var i = 0; i < selectedClips.length; i++) {
            var clip = selectedClips[i];
            if (clip.mediaType === "Video" && clip.projectItem) {
                var path = clip.projectItem.getMediaPath();
                if (path) {
                    var inSeconds = clip.inPoint.seconds;
                    var outSeconds = clip.outPoint.seconds;
                    var durSeconds = outSeconds - inSeconds;
                    if (durSeconds <= 0) durSeconds = 1;

                    clipDataList.push({
                        name: clip.name,
                        path: path,
                        inPointSeconds: inSeconds,
                        outPointSeconds: outSeconds,
                        durationSeconds: durSeconds
                    });
                }
            }
        }

        if (clipDataList.length === 0) {
            return JSON_stringify({ success: false, message: "No valid video media found in your selection." });
        }

        var prProjectPath = app.project ? app.project.path : "";
        var saveFolderPath = "";
        if (prProjectPath && prProjectPath.length > 0) {
            var lastSlashIndex = Math.max(prProjectPath.lastIndexOf('\\'), prProjectPath.lastIndexOf('/'));
            if (lastSlashIndex !== -1) {
                saveFolderPath = prProjectPath.substring(0, lastSlashIndex) + "/AE_Tracking_Files";
            }
        }

        // Build Payload Script for After Effects
        var clipDataStr = "[\n";
        for (var j = 0; j < clipDataList.length; j++) {
            var d = clipDataList[j];
            clipDataStr += "{ name: '" + escape(d.name) + "', path: '" + escape(d.path).replace(/\\/g, "/") + "', inPoint: " + d.inPointSeconds + ", outPoint: " + d.outPointSeconds + ", duration: " + d.durationSeconds + " }";
            if (j < clipDataList.length - 1) clipDataStr += ",\n";
        }
        clipDataStr += "\n]";

        var aePayload = "";
        aePayload += "var clipDataArray = " + clipDataStr + ";\n";
        aePayload += "var aeMain = function() {\n";
        aePayload += "  try {\n";
        aePayload += "    var prSavePath = unescape('" + escape(saveFolderPath).replace(/\\/g, "/") + "');\n";
        aePayload += "    var expectedFile = (prSavePath !== '') ? new File(prSavePath + '/AutoTrackedProject.aep') : new File('~/Desktop/AutoTrackedProject.aep');\n";
        aePayload += "    var isCorrectProject = (app.project.file !== null && app.project.file.fsName === expectedFile.fsName);\n";
        aePayload += "    if (!isCorrectProject) {\n";
        aePayload += "        if (expectedFile.exists) {\n";
        aePayload += "            var newProj = app.open(expectedFile);\n";
        aePayload += "            if (!newProj) throw new Error('User cancelled switching to the correct tracking project.');\n";
        aePayload += "        } else {\n";
        aePayload += "            var newProj = app.newProject();\n";
        aePayload += "            if (!newProj) throw new Error('User cancelled creating the correct tracking project.');\n";
        aePayload += "            if (prSavePath !== '') {\n";
        aePayload += "                var folder = new Folder(prSavePath);\n";
        aePayload += "                if (!folder.exists) folder.create();\n";
        aePayload += "            }\n";
        aePayload += "            app.project.save(expectedFile);\n";
        aePayload += "        }\n";
        aePayload += "    }\n";
        aePayload += "    app.beginUndoGroup('Import from Premiere');\n";
        aePayload += "    var trackedFolder = null;\n";
        aePayload += "    for(var f=1;f<=app.project.numItems;f++){ if(app.project.item(f) instanceof FolderItem && app.project.item(f).name==='_tracked'){ trackedFolder=app.project.item(f); break; } }\n";
        aePayload += "    if(!trackedFolder) trackedFolder = app.project.items.addFolder('_tracked');\n";
        aePayload += "    \n";
        aePayload += "    for(var k=0; k<clipDataArray.length; k++) {\n";
        aePayload += "        var data = clipDataArray[k];\n";
        aePayload += "        var decodedName = unescape(data.name);\n";
        aePayload += "        var decodedPath = unescape(data.path);\n";
        aePayload += "        \n";
        aePayload += "        var io = new ImportOptions(new File(decodedPath));\n";
        aePayload += "        var item = null;\n";
        aePayload += "        try { item = app.project.importFile(io); } catch(e) { continue; }\n";
        aePayload += "        \n";
        aePayload += "        if (item === null) throw new Error('Failed to import item: ' + decodedPath);\n";
        aePayload += "        \n";
        aePayload += "        var comp = app.project.items.addComp(decodedName + ' - Tracked', item.width, item.height, item.pixelAspect, data.duration, item.frameRate);\n";
        aePayload += "        comp.parentFolder = trackedFolder;\n";
        aePayload += "        \n";
        aePayload += "        var layer = comp.layers.add(item);\n";
        aePayload += "        layer.startTime = -data.inPoint;\n";
        aePayload += "        layer.inPoint = 0;\n";
        aePayload += "        layer.outPoint = data.duration;\n";
        aePayload += "        \n";
        aePayload += "        var tracker = null;\n";
        aePayload += "        try { tracker = layer.property('ADBE Effect Parade').addProperty('ADBE 3D Tracker'); }\n";
        aePayload += "        catch(e) { try { tracker = layer.property('ADBE Effect Parade').addProperty('3D Camera Tracker'); } catch(e2){} }\n";
        aePayload += "        if(tracker) {\n";
        aePayload += "            var isDetailedCheck = " + isDetailed + ";\n";
        aePayload += "            if (isDetailedCheck) {\n";
        aePayload += "                var setDetailed = function(group) {\n";
        aePayload += "                    for(var z=1; z<=group.numProperties; z++){ \n";
        aePayload += "                        var prop=group.property(z); \n";
        aePayload += "                        if(prop.name === 'Detailed Analysis'){ prop.setValue(1); prop.setValue(true); return true; }\n";
        aePayload += "                        if(prop.propertyType===PropertyType.NAMED_GROUP || prop.propertyType===PropertyType.INDEXED_GROUP) { if(setDetailed(prop)) return true; }\n";
        aePayload += "                    } return false;\n";
        aePayload += "                };\n";
        aePayload += "                try{ setDetailed(tracker); }catch(e){}\n";
        aePayload += "            }\n";
        aePayload += "        }\n";
        aePayload += "    }\n";
        aePayload += "    app.endUndoGroup();\n";
        aePayload += "    try {\n";
        aePayload += "        app.project.save();\n";
        aePayload += "    } catch(e) {}\n";
        aePayload += "    alert('Bridge Success! Generated ' + clipDataArray.length + ' tracker comps!\\n\\nBy: Antigravity Extension');\n";
        aePayload += "  } catch(err) {\n";
        aePayload += "    alert('After Effects payload crashed: ' + err.toString() + ' (Line: ' + err.line + ')');\n";
        aePayload += "  }\n";
        aePayload += "};\n";
        aePayload += "aeMain();";

        var bt = new BridgeTalk();
        bt.target = "aftereffects"; 
        bt.body = aePayload;
        
        var btError = null;
        bt.onError = function(err) { btError = err.body; };
        
        bt.send();

        if (btError) {
            return JSON_stringify({ success: false, message: "Bridge Error: " + btError });
        } else {
            return JSON_stringify({ success: true, message: "Sent " + clipDataList.length + " clips to After Effects!" });
        }
    } catch (error) {
        return JSON_stringify({ success: false, message: "Script Error: " + error.toString() });
    }
}
