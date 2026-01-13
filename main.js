import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import PortalItem from "@arcgis/core/portal/PortalItem.js";
import Basemap from "@arcgis/core/Basemap.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import Search from "@arcgis/core/widgets/Search.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";

// dictionary for converting ACS layer names to their respective 4-digit abbreviation 
const layerNameDict = {
'ACS Children by Parental Labor Force Participation':	'PLFP',
'ACS Children in Immigrant Families':	'IMMF',
'ACS Children with Grandparent Householder':	'CGNP',
'ACS Context for Child Well-Being':	'CHWB',
'ACS Context for Emergency Response':	'EMRS',
'ACS Context for Senior Well-Being':	'SNWB',
'ACS Disability by Type':	'TPDB',
'ACS Disability Status':	'DBTY',
'ACS Earnings by Occupation by Sex':	'ESEX',
'ACS Earnings by Occupation':	'MEOC',
'ACS Education by Veteran Status':	'VEDU',
'ACS Educational Attainment by Race by Sex':	'EARS',
'ACS Educational Attainment':	'EDAT',
'ACS Employment Status':	'EMPL',
'ACS English Ability and Linguistic Isolation':	'LISL',
'ACS Fertility in Past 12 Months by Age':	'FAGE',
'ACS Geographical Mobility':	'GMOB',
'ACS Health Insurance by Age by Race':	'HDEM',
'ACS Health Insurance Coverage':	'HINS',
'ACS Household Income Distribution':	'INCD',
'ACS Household Size':	'HHSZ',
'ACS Housing Costs by Age':	'HCBA',
'ACS Housing Costs':	'HOUB',
'ACS Housing Tenure by Education':	'TEDU',
'ACS Housing Tenure by Heating Fuel':	'THTF',
'ACS Housing Tenure by Race':	'TRAC',
'ACS Housing Units by Year Built':	'HYSB',
'ACS Housing Units in Structure':	'UNST',
'ACS Housing Units Occupancy':	'HOUT',
'ACS Housing Units Vacancy Status':	'VACY',
'ACS Internet Access by Age and Race':	'IDEM',
'ACS Internet Access by Education':	'IEDU',
'ACS Internet Access by Income':	'IINC',
'ACS Internet Access by Labor Force Participation':	'ILFP',
'ACS Internet Connectivity':	'INTC',
'ACS Labor Force Participation by Age':	'ALFP',
'ACS Language Spoken at Home':	'LANG',
'ACS Living Arrangements':	'LVAR',
'ACS Marital Status':	'MARS',
'ACS Median Age':	'MAGE',
'ACS Median Household Income':	'MINC',
'ACS Nativity and Citizenship':	'NATC',
'ACS Place of Birth':	'PLOB',
'ACS Population and Housing Basics':	'PHBC',
// 'ACS Population':	'TPOP',
'ACS Poverty Status':	'POVA',
'ACS Race and Hispanic Origin':	'RACE',
'ACS School Enrollment':	'SCHE',
'ACS Specific Asian Groups':	'ASDG',
'ACS Specific Hispanic or Latino Origin':	'HLDO',
'ACS Specific Language Spoken by English Ability':	'SLEA',
'ACS Transportation to Work':	'TRAN',
'ACS Travel Time To Work':	'COMM',
'ACS Vehicle Availability':	'VEHA',
'ACS Veteran Status':	'VETS',
'ACS Youth School and Work Activity':	'YOUT'
}


// tracking a pre-existing overlay toggle alert
let existingAlert;

// null vars for the three views that will occupy the panes of our application
let stateView = null;
let countyView = null;
let tractView = null;

// setting Kansas City as default center as its ~roughly~ central in US
const default_center = [-94.66, 39.04]

let selectedLayerName = "";
let selectedItemId = null;

// small function for cleaning up screenshot names
function convertToScreenshotName(input){

  // initializing the screenshot name to empty string
  let screenshotName = "";

  // removing 'variables' from the input
  input = input.replace('Variables', '');

  // first splitting on dashes to get the two constituent parts of the layer's name
  let parts = input.split('-').map(p => p.trim());
  
  let acsLayerName = parts[0];

  // if the layer's name does exist as a key in the dict
  if(layerNameDict[acsLayerName]){

    // then we'll use it to grab the 4-letter abbreviation
    screenshotName = layerNameDict[acsLayerName];
    
    // and differentiate between boundaries and centroids
    if(parts[1] == 'Centroids'){
      screenshotName += "_Centroids";
    }
    
  // otherwise, we just default to the full layer name with whitespaces removed
  } else {
    screenshotName = parts.join('_').replace(/\s+/g, '_');
  }

  console.log('Final screenshot name: ', screenshotName)
  
  return screenshotName;
}

// screenshot name variable to be used when saving files
let screenshotName = "";

// predefined visibility ranges, we'll likely tweak these 
const visibilityRanges = {
  0:  { minScale: 50000000, maxScale: 10000000 },
  1: { minScale: 10000000, maxScale: 5000000 },
  2:  { minScale: 2000000, maxScale: 0 }
};


/*
***********************************************
MAP VIEW FUNCTIONALITIES
***********************************************
*/

// function to create layers based on visibility ranges
// this will only happen once per view, as each column only gets one layer (state, county, or tract)
function createLayers(itemId, sublayerIds) {
  return sublayerIds.map(layerNum => {
    // create new feature layer for each sublayer
    const layer = new FeatureLayer({
      portalItem: { id: itemId },
      layerId: layerNum
    });
    // resetting visibility ranges and applying predefined ones
    const range = visibilityRanges[layerNum] || { minScale: 0, maxScale: 0 };
    layer.minScale = range.minScale;
    layer.maxScale = range.maxScale;
    // returning newly created layer with consistent visibility range
    return layer;
  });
}

async function resetView(v){
  let l;
  if(v.map.layers.length > 0){
    try {
      await v.map.layers.getItemAt(0).load();
      l = v.map.layers.getItemAt(0);
    } catch (err) {
      console.warn("Error loading layer for zoom:", err);
    }
  }
  // if a layer exists, calculate mid scale for visibility
  if (l) {
    const midScale = (l.minScale + l.maxScale) / 2;
    // console.log(`Resetting view for Layer ${l.title} to mid scale of: ${midScale}`);
    v.goTo({ scale: midScale, center: default_center });
  } else {
    // no operational layer present (basemap-only) — use a sensible default scale
    const defaultScale = 5000000;
    // console.log(`Resetting view to default scale: ${defaultScale}`);
    v.goTo({ scale: defaultScale, center: default_center });
  }
}

// create a basemap-only view for a given container
async function createBasemapOnlyView(containerId) {
  const base = new Basemap({
    baseLayers: [
      new VectorTileLayer({
        portalItem: { id: "291da5eab3a0412593b66d384379f89f" },
        title: "Light Gray Canvas Base",
        opacity: 1,
        visible: true
      })
    ]
  });

  const map = new Map({
    basemap: base,
    layers: []
  });

  const view = new MapView({
    container: containerId,
    map: map,
    ui: { components: [] }
  });

  await view.when();
  resetView(view);
  view.popupEnabled = false;
  return view;
}

// function to create a map view using the layers associated with the given AGOL item id.
// though sublayerIDs is an array, it will only contain one value per view (state, county, or tract)
async function createView(containerId, itemId, sublayerIds, rangeKey) {

  const base = new Basemap({
    baseLayers: [
      // have to use real vectortilelayers (not plain objects) so the API can load them
      new VectorTileLayer({
        portalItem: { id: "291da5eab3a0412593b66d384379f89f" },
        title: "Light Gray Canvas Base",
        opacity: 1,
        visible: true
      }),
      // keeping the other components to the human geography base in case we want them
      // new VectorTileLayer({
      //   portalItem: { id: "2afe5b807fa74006be6363fd243ffb30" },
      //   title: "Human Geography Base",
      //   opacity: 1,
      //   visible: true
      // }),
      // new VectorTileLayer({
      //   portalItem: { id: "97fa1365da1e43eabb90d0364326bc2d" },
      //   title: "Human Geography Detail",
      //   opacity: 0.5,
      //   visible: true
      // })
    ]
  })


  // creating a map using the list of layers for the agol item ID
  const map = new Map({
    basemap: base, // may end up changing this
    layers: createLayers(itemId, sublayerIds, rangeKey)
  });

  // creating a map view for a specific container (aka one of the three columns on screen)
  const view = new MapView({
    container: containerId,
    map: map,
  });

  // resetting view zoom levels & center
  resetView(view);

  // turning off popups
  view.popupEnabled = false;

  return view;
}

/*
***********************************************
AGOL ITEM FUNCTIONALITIES
***********************************************
*/

// grabs the title for an AGOL item based on its AGOL item id, will be used to populate calcite items
async function getItemTitle(itemId) {
  try {
    // Creates a new portal item from the item id
    const item = new PortalItem({ id: itemId });
    // we'll wait for it to load
    await item.load();
    // we'll return the item title, or fall back to the item name, or just the item id if unavailable
    return item.title || item.name || itemId;
  // logging errors
  } catch (err) {
    console.warn(`Failed to load portal item ${itemId}:`, err);
    return itemId;
  }
}

// only loading selected item so as to improve performance
async function loadSelectedItem(itemId) {
  if (stateView) stateView.destroy();
  if (countyView) countyView.destroy();
  if (tractView) tractView.destroy();
  
  stateView = await createView("state-map", itemId, [0]);
  countyView = await createView("county-map", itemId, [1]);
  tractView = await createView("tract-map", itemId, [2]);
}

/*
***********************************************
CALCITE LIST FUNCTIONALITIES
***********************************************
*/

// grabbing the dialog box 
const inputDialog = document.getElementById("input");
if (inputDialog) {
  inputDialog.addEventListener('keydown', function(event) {
    // uaing the enter key to trigger when input is considered 'done''
    if (event.key === 'Enter') {
        // preventing the default enter action
        event.preventDefault();
        // populating our calcite list based on the input IDs
        populateListGroup(inputDialog);
    }
  });
} else {
  console.warn("input-dialog element not found in DOM.");
}

const listGroup = document.getElementById("list-group");
(async () => {
  if (!listGroup) return;
  // if input already has IDs on load, populate the list
  if (inputDialog && inputDialog.value && inputDialog.value.trim()) {
    await populateListGroup(inputDialog);
  }
})();

// create basemap-only views at startup so user sees a map instead of blank columns
(async () => {
  try {
    stateView = await createBasemapOnlyView("state-map");
    countyView = await createBasemapOnlyView("county-map");
    tractView = await createBasemapOnlyView("tract-map");
  } catch (e) {
    console.warn('Failed to create basemap-only views on startup:', e);
  }
})();

// grabbing the list length label to update when we populate our list group
const listLengthLabel = document.getElementById("list-length")

// udpates the list label length number 
function updateListLengthLabel() {
  if (!listGroup || !listLengthLabel) return;
  const len = listGroup.querySelectorAll("calcite-list-item").length;
  if(len == 1){
    listLengthLabel.textContent = "List length: " + len + " item";
  } else {
    listLengthLabel.textContent = "List length: " + len + " items";
  }
}

// ------------------- POPULATING LIST FROM INPUT -------------------
async function populateListGroup(inputDialog){
  const raw = inputDialog.value || "";
  // split on commas or newlines and whitespace and also trim/remove empties
  const itemIDs = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  // remove any dupes that may be in the input dialog
  const uniqueItemIDs = Array.from(new Set(itemIDs));
  if (!listGroup) return;
  // if there's nothing in the input return nothing
  if (uniqueItemIDs.length === 0) return;

  // figuring out which IDs are already in the list to only add new ones, avoiding dupes
  const existingItems = Array.from(listGroup.querySelectorAll("calcite-list-item"));
  const existingIds = new Set(existingItems.map(el => (el.value !== undefined ? el.value : el.getAttribute("value"))));
  const listWasEmpty = existingItems.length === 0;

  let appendedCount = 0;
  for (const id of uniqueItemIDs) {
    if (existingIds.has(id)) continue; // skip IDs already present

    const title = await getItemTitle(id);
    const listItem = document.createElement("calcite-list-item");
    listItem.label = title;
    listItem.scale = "s";
    listItem.value = id;
    listItem.closable = true;

    // only selecting the first item if the map was empty before an append
    if (listWasEmpty && appendedCount === 0) {
      listItem.selected = true;
      selectedItemId = listItem.value;
      selectedLayerName = listItem.label;
      screenshotName = convertToScreenshotName(selectedLayerName) + ".png";
      // add the selected item's layers to the existing basemap-only views
      await updateViewsForItem(id);
    }

    // adding the item to the calcite list
    listGroup.appendChild(listItem);
    appendedCount++;
    
    // event handler for when a list item is selected, NOT removed
    listItem.addEventListener("calciteListItemSelect", async () => {
      selectedItemId = listItem.value;
      selectedLayerName = listItem.label;
      console.log('click registered for item: ', selectedLayerName)
      screenshotName = convertToScreenshotName(selectedLayerName) + ".png";
      await updateViewsForItem(selectedItemId);
    });
    
    // event handler for when a list item is removed, NOT selected
    listItem.addEventListener("calciteListItemClose", async (evt) => {
      try{
        // removing calcite  item from  DOM
        listItem.remove();
        updateListLengthLabel();
        const removedId = listItem.value;
        const wasSelected = (removedId === selectedItemId); 
        console.log("Was the removed item selected? ", wasSelected)
        if (wasSelected) {
          // clearing all operational layers from all views
          [stateView, countyView, tractView].forEach(v => {
            if (v && v.map && v.map.layers) {
              v.map.layers.removeAll();
              resetView(v);
              v.popupEnabled = false;
            }
          });

          // resetting traclomgvariables
          selectedItemId = null;
          selectedLayerName = "";
          screenshotName = "";
        }
      }  catch (e) {
        console.warn('Error removing list item or clearing views:', e);
      }
    });
  }

  // clearing the input dialog after processing the pasted input
  inputDialog.value = "";

  // updating the list length label only AFTER fully populating the list 
  updateListLengthLabel();

  // logging the defaults for debug 
  console.log("Selected item name: ", selectedLayerName, ", id: ", selectedItemId)
}

// ------------------- UPDATING MAP VIEWS -------------------
// function to update 3 map views based on selected item 
async function updateViewsForItem(itemId) {
  const mappings = [
    { view: stateView, sublayers: [0] },
    { view: countyView, sublayers: [1] },
    { view: tractView, sublayers: [2] },
  ];

  // looping through sublayers of view
  for (const { view, sublayers } of mappings) {
    if (!view || !view.map) continue;
    // first removing all layers from a given view (aka clearing each map column)
    view.map.layers.removeAll();
    // creating a new layers for the specific sublayer of the selected agol item id
    const newLayers = createLayers(itemId, sublayers); 
    // adding new layers to the map
    newLayers.forEach((ly) => view.map.layers.add(ly));
    resetView(view);
    // turning off popups
    view.popupEnabled = false;
  }
}

/*
***********************************************
BUTTON FUNCTIONALITIES
***********************************************
*/

// ------------------- OVERLAY BUTTON FUNCTIONALITY -------------------
// grabbing the overlay div
const overlay = document.getElementById("screenshot-overlay");
// overlay defaults to visible, aka true
let overlayStatus = true; 
// grabbing the overlay toggle button
const overlayToggle = document.getElementById("overlay-toggle");
// toggling based on click event listener
overlayToggle.addEventListener("click", () => {
  // if overlay was OFF before the toggle was clicked
  if (overlay.style.display == 'none') {
    // then we turn on the overlay 
    overlay.style.display = 'block';
    // and set visibility to true
    overlayStatus = true;
    // if there was an alert previously visible, we remove it
    existingAlert = document.querySelector("calcite-alert")
    if(existingAlert) existingAlert.remove();
    
    // if overlay was ON before the toggle was clicked
  } else {
    // then we turn off the overlay
    overlay.style.display = 'none';
    // and set the visibility to false
    overlayStatus = false;
  }
});

// ------------------- SCREENSHOT BUTTON FUNCTIONALITY -------------------
// grabbing the container that holds our maps, we'll put warning over this container if screenshot is selected with overlay OFF
const screenshotButton = document.getElementById("screenshot-button");
if (screenshotButton) {
  screenshotButton.addEventListener("click", captureScreenshot);
} else {
  console.warn("screenshot-button element not found in DOM.");
}

// helper function for shwoing a warning if the overlay is turned off when taking screenshot
function showScreenshotWarning() {
  // removing any pre-existing alert
  existingAlert = document.querySelector("calcite-alert")
  if(existingAlert) existingAlert.remove();

  // displaying an alert, warning the user to turn on the overlay when taking screensbot 
  const screenshotWarning = document.createElement("calcite-alert");
  screenshotWarning.open = true;
  screenshotWarning.kind = "warning";
  screenshotWarning.autoDismiss = true;
  const title = document.createElement("calcite-alert-message");
  title.textContent = "Overlay must be ENABLED (it will not be captured in screenshot).";
  title.slot = "title";
  screenshotWarning.appendChild(title);

  // appending the warning to the DOM
  document.body.appendChild(screenshotWarning);
}

// actual function for capturing screenshot
async function captureScreenshot() {
  
  // if the overlay is OFF when the screenshot button is clicked, we want to warn the user
  if (!overlayStatus) {
    showScreenshotWarning();
    return; // stop screenshot process

  // otherwise, the overlay is ON, so we'll capture the screenshot
  } else {
    console.log("Overlay is on, capturing screenshot.")
    
    // grabbing the overlay rectangle in screenspace
    const overlayRectangle = overlay.getBoundingClientRect();
    
    // calculating intersection between two rectangles to determine what part of each map view is within the overlay
    function intersectRects(a, b) {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      const width = right - left;
      const height = bottom - top;
      if (width > 0 && height > 0) return { left, top, width, height };
      return null;
    }
    
    const views = [
      { view: stateView, name: "state" },
      { view: countyView, name: "county" },
      { view: tractView, name: "tract" },
    ];
    
  const shotsInfo = await Promise.all(
    views.map(async ({ view, name }) => {
      if (!view) return null;
      await view.when();

      // ensure the view's layer is loaded so we can inspect fullExtent
      const layer = view.map.layers.getItemAt(0);
      if (!layer) return null;
      await layer.load();

      // grabbing the rectangle of each map view and determining its intersection with the overlay element
      const viewRect = view.container.getBoundingClientRect();
      const intersection = intersectRects(overlayRectangle, viewRect);
      if (!intersection) {
        console.log(`${name} view: no DOM intersection with overlay`);
        return null;
      }

      // convert the overlay intersection (screen coords) into map coords which we need for view.takeScreenshot()
      // top-left
      const topLeft = view.toMap({
        x: Math.round(intersection.left - viewRect.left),
        y: Math.round(intersection.top - viewRect.top)
      });
      // bottom-right
      const bottomRight = view.toMap({
        x: Math.round(intersection.left - viewRect.left + intersection.width - 1),
        y: Math.round(intersection.top - viewRect.top + intersection.height - 1)
      });

      // create an extent in the view's spatial reference
      const overlayExtent = new Extent({
        xmin: Math.min(topLeft.x, bottomRight.x),
        ymin: Math.min(topLeft.y, bottomRight.y),
        xmax: Math.max(topLeft.x, bottomRight.x),
        ymax: Math.max(topLeft.y, bottomRight.y),
        spatialReference: view.spatialReference
      });
      
      // if layer has no fullExtent, skip geographic test and proceed
      if (layer.fullExtent) {
        const intersects = geometryEngine.intersects(overlayExtent, layer.fullExtent);
        if (!intersects) {
          console.log(`${name} view: overlay does not intersect layer geographic extent`);
          return null;
        }
      }

      // area relative to this view's top-left 
      const area = {
        x: Math.round(intersection.left - viewRect.left),
        y: Math.round(intersection.top - viewRect.top),
        width: Math.round(intersection.width),
        height: Math.round(intersection.height)
      };

      try {
        const shot = await view.takeScreenshot({
          area,
          format: "png",
          includeBackground: true
        });
        return {
          shot,
          intersection
        };
      } catch (err) {
        console.warn(`takeScreenshot failed for ${name}:`, err);
        return null;
      }
    })
  );

    
    console.log("SCREENSHOT NAME: ", screenshotName);
    
    // filter out non-intersecting / failed shots
    const validShots = shotsInfo.filter(Boolean);
    if (validShots.length === 0) {
      console.warn("No screenshots captured (overlay may be outside all views).");
      return;
    }
    
    // final canvas size = overlay rectangle size (rounded)
    const canvasWidth = Math.round(overlayRectangle.width);
    const canvasHeight = Math.round(overlayRectangle.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    
    let loadedCount = 0;
    validShots.forEach(({ shot, intersection }) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = shot.dataUrl || shot.data;
      img.onload = () => {
        
        // draws each image onto the final canvas based on the intersection with the overlay
        const destX = Math.round(intersection.left - overlayRectangle.left);
        const destY = Math.round(intersection.top - overlayRectangle.top);
        ctx.drawImage(img, destX, destY, intersection.width, intersection.height);
        loadedCount++;
        if (loadedCount === validShots.length) {
          const link = document.createElement("a");
          link.download = screenshotName || "screenshot.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
      };
      img.onerror = (e) => {
        console.warn("Image load error for shot:", e);
        loadedCount++;
      };
    });

  }
}

// ------------------- RESET VIEW BUTTON FUNCTIONALITY -------------------
// grabbing the reset views button
const resetButton = document.getElementById("view-reset");
if (resetButton) {
  resetButton.addEventListener("click", () => {
    [stateView, countyView, tractView].forEach(v => {
      if (v) resetView(v);
    });
  });
} else {
  console.warn("view-reset element not found in DOM.");
}

// ------------------- SEARCH BUTTON FUNCTIONALITY -------------------
let showSearch = false;
let tractSearchWidget = null; // store reference

// grabbing the show search button from the dom
const searchButton = document.getElementById("show-search");
if (searchButton) {
  searchButton.addEventListener("click", () => {
    // if the search was already visible in the tract view
    if (showSearch) {
      // then we remove the search widget
      if (tractSearchWidget) {
        tractView.ui.remove(tractSearchWidget);
      }
      showSearch = false;
      // and change the text & icon for the button
      searchButton.textContent = "Show Search";
      searchButton.iconStart = "magnifying-glass-plus";
    } else {
      // if the search widget didn't exist when the button was clicked then we create it 
      if (!tractSearchWidget) {
        tractSearchWidget = new Search({ view: tractView });
      }
      // add it to the top right corner
      tractView.ui.add(tractSearchWidget, "top-right");
      showSearch = true;
      // and change the text & icon for the button
      searchButton.textContent = "Hide Search";
      searchButton.iconStart = "magnifying-glass-minus";
    }
    console.log("Search status is:", showSearch);
  });
} else {
  console.warn("search-hide element not found in DOM.");
}

