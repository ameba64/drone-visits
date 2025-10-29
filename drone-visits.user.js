// ==UserScript==
// @author         3ch01c, Johtaja, ameba64
// @name           IITC plugin: Drone Visits
// @category       Misc
// @version        1.0.0.20251030.205415
// @description    Allow manual entry of portals droned. Highlighters to identify new portals to visit with drone.
// @id             drone-visits
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @downloadURL    https://github.com/ameba64/drone-visits/raw/main/drone-visits.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
  // ensure plugin framework is there, even if iitc is not yet loaded
  if (typeof window.plugin !== 'function') window.plugin = function () { };

  //PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
  //(leaving them in place might break the 'About IITC' page or break update checks)
  plugin_info.buildName = 'local';
  plugin_info.dateTimeVersion = '2025-10-30.180015';
  plugin_info.pluginId = 'drone-visits';
  //END PLUGIN AUTHORS NOTE

  // use own namespace for plugin
  window.plugin.droneVisits = function () { };

  // delay in ms
  window.plugin.droneVisits.SYNC_DELAY = 5000;

  // maps the JS property names to localStorage keys
  window.plugin.droneVisits.FIELDS = {
    'data': 'plugin-drone-visits-data'
  };

  window.plugin.droneVisits.data = {};

  window.plugin.droneVisits.disabledMessage = null;
  window.plugin.droneVisits.contentHTML = null;

  window.plugin.droneVisits.isHighlightActive = false;

  window.plugin.droneVisits.onPortalDetailsUpdated = function () {
    if (typeof (Storage) === "undefined") {
      $('#portaldetails > .imgpreview').after(plugin.droneVisits.disabledMessage);
      return;
    }
    var guid = window.selectedPortal;
    $('#portaldetails > .imgpreview').after(plugin.droneVisits.contentHTML);
    plugin.droneVisits.updateCheckedAndHighlight(guid);
  }

  window.plugin.droneVisits.updateCheckedAndHighlight = function (guid) {
    runHooks('pluginDroneVisitsUpdate', { guid: guid });

    if (guid == window.selectedPortal) {
      var info = plugin.droneVisits.data[guid];
      var droned = (info && info.droned) || false;
      $('#droned').prop('checked', droned);
    }

    if (window.plugin.droneVisits.isHighlightActive) {
      if (portals[guid]) {
        window.setMarkerStyle(portals[guid], guid == selectedPortal);
      }
    }
  }

  window.plugin.droneVisits.setPortalAction = function (portal, action) {
    if (action !== 'droned') return;

    let latE6 = portal.latE6;
    let lngE6 = portal.lngE6;
    let guid = window.findPortalGuidByPositionE6(latE6, lngE6);
    let id = latE6 + "," + lngE6;

    if (guid) {
      let info = window.plugin.droneVisits.data[guid];
      if (!info) info = {};
      info.droned = true;
      window.plugin.droneVisits.data[guid] = info;
      window.plugin.droneVisits.storeLocal('data');
      // trigger highlighters
      plugin.droneVisits.updateCheckedAndHighlight(guid);
    } else {
      // guid not found; cannot mark droned without a GUID
      console.log('DRONE VISITS: portal GUID not found for position', latE6, lngE6);
    }
  }
  // Droned
  window.plugin.droneVisits.updateDroned = function (droned, guid) {
    if (guid == undefined) guid = window.selectedPortal;

    var info = plugin.droneVisits.data[guid];
    if (!info) {
      plugin.droneVisits.data[guid] = info = { droned: false };
    }

    if (droned == info.droned) return;

    info.droned = !!droned;

    plugin.droneVisits.updateCheckedAndHighlight(guid);
    // persist change to localStorage so it survives app restart
    window.plugin.droneVisits.storeLocal('data');
  }

  window.plugin.droneVisits.storeLocal = function (name) {
    var key = window.plugin.droneVisits.FIELDS[name];
    if (key === undefined) return;

    var value = plugin.droneVisits[name];

    if (typeof value !== 'undefined' && value !== null) {
      localStorage[key] = JSON.stringify(value);
    } else {
      localStorage.removeItem(key);
    }
  }

  window.plugin.droneVisits.loadLocal = function (name) {
    var key = window.plugin.droneVisits.FIELDS[name];
    if (key === undefined) return;

    if (localStorage[key] !== undefined) {
      try {
        var parsed = JSON.parse(localStorage[key]);

        if (name === 'data' && Array.isArray(parsed)) {
          var mapping = {};
          parsed.forEach(function (guid) { mapping[guid] = { droned: true }; });
          plugin.droneVisits[name] = mapping;
          // persist normalized mapping back to storage for consistency
          try { localStorage[key] = JSON.stringify(mapping); } catch (e) { /* ignore */ }
        } else {
          plugin.droneVisits[name] = parsed;
        }
      } catch (err) {
        console.warn('DRONE VISITS: failed to parse stored data for', key, err);
        plugin.droneVisits[name] = {};
      }
    }
  }

  // Remove all local plugin data (safe operation, invoked after confirmation)
  window.plugin.droneVisits.cleanData = function () {
    var key = window.plugin.droneVisits.FIELDS.data;
    if (!key) return;

    var current = plugin.droneVisits.data || {};
    var total = Object.keys(current).length;

    try {
      localStorage.removeItem(key);
      localStorage.removeItem(key + '.raw');
    } catch (e) { /* ignore */ }

    plugin.droneVisits.data = {};
    window.runHooks('pluginDroneVisitsRefreshAll');
    if (window.selectedPortal) window.plugin.droneVisits.updateCheckedAndHighlight(window.selectedPortal);
    try {
      if (typeof resetHighlightedPortals === 'function') resetHighlightedPortals();
      else if (window.portals) {
        for (var p in window.portals) {
          try { window.setMarkerStyle(window.portals[p], p == window.selectedPortal); } catch (e) { }
        }
      }
    } catch (e) { }

    alert('Removed Drone Visits data: cleared ' + total + ' stored entries and localStorage keys.');
  };

  // Show a confirmation dialog (mirrors bookmarks plugin style) before clearing all plugin data
  window.plugin.droneVisits.promptClean = function () {
    var current = plugin.droneVisits.data || {};
    var total = Object.keys(current).length;

    if (total <= 0) {
      alert('No stored Drone Visits data found.');
      return;
    }

    var html = '<div>Found <b>' + total + '</b> stored Drone Visits entries.'
             + '<br><br>This will <b>delete all local Drone Visits data</b> (clear stored entries and localStorage keys).'
             + '<br><br>Are you sure you want to proceed? This cannot be undone.'
             + '</div>';

    var d = window.dialog({
      title: 'Clear Drone Visits Data',
      html: html,
      width: 480,
      buttons: {
        'Delete all': function() {
          window.plugin.droneVisits.cleanData();
          $(this).dialog('close');
        },
        'Cancel': function() { $(this).dialog('close'); }
      }
    });
    d.parent();
  };

  /****************************************************************************************/
  /** HIGHLIGHTERS ************************************************************************/
  /****************************************************************************************/
  window.plugin.droneVisits.highlighterDroned = {
    highlight: function (data) {
      var guid = data.portal.options.ent[0];
      var uniqueInfo = window.plugin.droneVisits.data[guid];

      var style = {};

      if (uniqueInfo && uniqueInfo.droned) {
      } else {
        style.fillColor = 'red';
        style.fillOpacity = 0.7;
      }
      data.portal.setStyle(style);
    },

    setSelected: function (active) {
      window.plugin.droneVisits.isHighlightActive = active;
    }
  }

  window.plugin.droneVisits.setupCSS = function () {
    $("<style>")
      .prop("type", "text/css")
      .html('\
#dronevisits-container {\
  display: block;\
  text-align: center;\
  margin: 6px 3px 1px 3px;\
  padding: 0 4px;\
}\
#dronevisits-container label {\
  margin: 0 0.5em;\
}\
#dronevisits-container input {\
  vertical-align: middle;\
}\
\
.portal-list-dronevisits input[type=\'checkbox\'] {\
  padding: 0;\
  height: auto;\
  margin-top: -5px;\
  margin-bottom: -5px;\
}\
\
.ui-dialog-portalslist {\
  max-width: none !important;\
}\
\
')
      .appendTo("head");
  }

  window.plugin.droneVisits.setupContent = function () {
    plugin.droneVisits.contentHTML = '<div id="dronevisits-container">'
      + '<label><input type="checkbox" id="droned" onclick="window.plugin.droneVisits.updateDroned($(this).prop(\'checked\'))"> Droned</label>'
      + '</div>';
    plugin.droneVisits.disabledMessage = '<div id="dronevisits-container" class="help" title="Your browser does not support localStorage">Plugin Drone Visits disabled</div>';
  }
  // ***************************************************************************************
  window.plugin.droneVisits.setupPortalsList = function () {

    window.plugin.portalslist.fields.push(
      {
        title: "D",
        value: function (portal) { return portal.options.guid; },
        sort: function (guidA, guidB) { return 0; },
        format: function (cell, portal, guid) {
          var info = plugin.droneVisits.data[guid];
          if (!info) info = { droned: false };

          $(cell).addClass("portal-list-dronevisits");

          $('<input>')
            .prop({
              type: "checkbox",
              className: "droned",
              title: "Portal droned?",
              checked: !!info.droned,
            })
            .attr("data-list-dronevisits", guid)
            .appendTo(cell)
          [0].addEventListener("change", function (ev) {
            window.plugin.droneVisits.updateDroned(this.checked, guid);
            ev.preventDefault();
            return false;
          }, false);
        },
      }
    );
  };

  /****************************************************************************************/
  /** Im-/Export of drone visits *********************************************************/
  /****************************************************************************************/
  window.plugin.droneVisits.optExport = function () {
    var data = localStorage[window.plugin.droneVisits.FIELDS.data];
    // Mirror bookmarks plugin: directly call saveFile (IITC provides this in supported builds)
    window.saveFile(data, 'IITC-drone-visits.json', 'application/json');
  }
  window.plugin.droneVisits.optImport = function () {
    L.FileListLoader.loadFiles({ accept: 'application/json' }).on('load', function (e) {
      try {
        var parsed = JSON.parse(e.reader.result);
        var toSaveObj = null;

        if (Array.isArray(parsed)) {
          // convert array -> mapping { guid: { droned: true } }
          toSaveObj = {};
          parsed.forEach(function (guid) { toSaveObj[guid] = { droned: true }; });
        } else if (parsed && typeof parsed === 'object') {
          // mapping - normalize boolean-true entries to {droned:true}
          var needNormalize = false;
          for (var k in parsed) {
            if (parsed[k] === true) { needNormalize = true; break; }
          }
          if (needNormalize) {
            toSaveObj = {};
            for (var k2 in parsed) {
              if (parsed[k2] === true) toSaveObj[k2] = { droned: true };
              else toSaveObj[k2] = parsed[k2];
            }
          } else {
            // assume already in the correct mapping shape
            toSaveObj = parsed;
          }
        } else {
          throw new Error('Unsupported JSON structure for import');
        }

        // prune any entries that don't have a truthy droned flag (keep only droned:true)
        var totalKeys = 0;
        var prunedCount = 0;
        var prunedMap = {};
        for (var g in toSaveObj) {
          totalKeys++;
          var e = toSaveObj[g];
          if (e && e.droned) prunedMap[g] = e;
          else prunedCount++;
        }
        if (prunedCount > 0) {
          console.log('DRONE VISITS: pruned', prunedCount, 'non-droned entries during import (kept', Object.keys(prunedMap).length, 'of', totalKeys, ').');
          toSaveObj = prunedMap;
        }

        localStorage[window.plugin.droneVisits.FIELDS.data] = JSON.stringify(toSaveObj);
        // reload into memory
        window.plugin.droneVisits.loadLocal('data');
        // refresh UI
        if (window.selectedPortal) window.plugin.droneVisits.updateCheckedAndHighlight(window.selectedPortal);
        if (window.plugin.droneVisits.isHighlightActive) resetHighlightedPortals();
        window.runHooks('pluginDroneVisitsRefreshAll');
        console.log('DRONE VISITS: reset and imported droned info.');
        var msg = 'Import Successful.';
        if (prunedCount > 0) msg += ' Removed ' + prunedCount + ' non-droned entries.';
        confirm(msg);
      } catch (err) {
        console.warn('DRONE VISITS: failed to import data: ' + err);
      }
    });
  }

  window.plugin.droneVisits.options = function () {
    let aoPortals = window.plugin.droneVisits.data;
    let droned = 0;
    $.each(aoPortals, function (PUID) {
      let aPortal = window.plugin.droneVisits.data[PUID];
      if (aPortal && aPortal.droned) droned++;
    });

    let list = 'Droned Portals Count:<br>droned: ' + droned + '<br><hr>'
      + '<a onclick="window.plugin.droneVisits.optExport();return false" title="Export portals\' droned info to IITC.">Backup</a> / '
      + '<a onclick="window.plugin.droneVisits.optImport();return false" title="Import portals\' droned info to IITC.">Restore</a> / '
      + '<a onclick="window.plugin.droneVisits.promptClean();return false" title="Remove all Drone Visits local data">Clean</a>';
    var dialog = window.dialog({
      title: "Drone Visits",
      html: list,
      maxHight: 300

    }).parent();

    return dialog;
  }
  /****************************************************************************************/
  var setup = function () {
    window.plugin.droneVisits.setupCSS();
    window.plugin.droneVisits.setupContent();
    window.plugin.droneVisits.loadLocal('data');

    if (typeof window.addPortalHighlighter === 'function'
        && window.plugin.droneVisits.highlighterDroned
        && typeof window.plugin.droneVisits.highlighterDroned.highlight === 'function') {
      window.addPortalHighlighter('Droned', window.plugin.droneVisits.highlighterDroned);
    }

    if (typeof window.addHook === 'function' && typeof window.plugin.droneVisits.onPortalDetailsUpdated === 'function') {
      window.addHook('portalDetailsUpdated', window.plugin.droneVisits.onPortalDetailsUpdated);
    }

    // add controls to toolbox
    link = $("<a onclick=\"window.plugin.droneVisits.options();return false\" title=\"Manage Drone Visits\">Drone Visits</a>");
    $("#toolbox").append(link);

    if (window.plugin.portalslist) {
      window.plugin.droneVisits.setupPortalsList();
    }
  }

  setup.info = plugin_info; //add the script info data to the function as a property
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  // if IITC has already booted, immediately run the 'setup' function
  if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
