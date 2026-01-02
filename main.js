import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import PortalItem from "@arcgis/core/portal/PortalItem.js";
import Basemap from "@arcgis/core/Basemap.js";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer.js";
import Search from "@arcgis/core/widgets/Search.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";

// const itemIDs = [
//   '23ab8028f1784de4b0810104cd5d1c8f',
//   '45ede6d6ff7e4cbbbffa60d34227e462',
//   '0e468b75bca545ee8dc4b039cbb5aff6',
//   '84e3022a376e41feb4dd8addf25835a3',
//   'f430d25bf03744edbb1579e18c4bf6b8',
//   '2de116f62be54987b63b978c06a0a085',
//   '7c69956008bb4019bbbe67ed9fb05dbb',
//   'ab08335514884c1f834e4cc43fb55c51',
//   'babfd093d1f645e092edcb2cf301eaab',
//   '5522b6f6d6eb48e6ac33164657c6d7a0',
// ];

let existingAlert;

let stateView = null;
let stateVisible = false;

let countyView = null;
let countyVisible = false;

let tractView = null;
let tractVisible = false;

// setting Kansas City as default center as its ~roughly~ central in US
const default_center = [-94.66, 39.04]

let selectedLayerName = "";

// screenshot name variable to be used when saving files
let screenshotName = "";

// small function for cleaning up screenshot names
function convertToScreenshotName(input){
  // Split on dashes
  let parts = input.split('-').map(p => p.trim());

  // Keep only the first two parts (drop the second variable)
  let firstTwo = parts.slice(0, 2);

  // Join with underscores, replacing spaces with underscores
  let result = firstTwo.join('_').replace(/\s+/g, '_');

  return result;
}

// predefined visibility ranges, we'll likely tweak these 
const visibilityRanges = {
  0:  { minScale: 50000000, maxScale: 10000000 },
  1: { minScale: 10000000, maxScale: 5000000 },
  2:  { minScale: 2000000, maxScale: 0 }
};

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
  try {
    await v.map.layers.getItemAt(0).load();
    l = v.map.layers.getItemAt(0);
  } catch (err) {
    console.warn("Error loading layer for zoom:", err);
  }
  // calculating mid scale for visibility, a range in which symbology should definitely be visible
  const midScale = (l.minScale + l.maxScale) / 2;
  // console log for debug
  console.log(`Resetting view for Layer ${l.title} to mid scale of: ${midScale}`);
  // zooming to visibility mid scale and center of country 
  v.goTo({ scale: midScale, center: default_center });
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
    ui: { components: []}  // no default UI components, we don't want zoom +- or layer list
  });

  // resetting view zoom levels & center
  resetView(view);

  // turning off popups
  view.popupEnabled = false;

  return view;
}

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

//
const inputDialog = document.getElementById("input");
if (inputDialog) {
  inputDialog.addEventListener('keydown', function(event) {
    // ensuring key pressed is 'Enter'
    if (event.key === 'Enter') {
        // preventing default action
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

    // set screenshot name from the title when clicked
    listItem.addEventListener("click", async () => {
      selectedLayerName = listItem.label;
      screenshotName = convertToScreenshotName(selectedLayerName) + ".png";
      await updateViewsForItem(id);
    });

    // handle removal when user clicks the close icon
    listItem.addEventListener("calciteListItemClose", async (evt) => {
      try {
        listItem.remove();
      } catch (e) {
        console.warn('Failed to remove list item DOM node:', e);
      }
      updateListLengthLabel();
    });

    // only selecting the first item if the map was empty before an append
    if (listWasEmpty && appendedCount === 0) {
      listItem.selected = true;
      selectedLayerName = title;
      screenshotName = convertToScreenshotName(selectedLayerName) + ".png";
      await loadSelectedItem(id);
    }

    listGroup.appendChild(listItem);
    appendedCount++;
  }
  // clearing the input dialog after processing
  inputDialog.value = "";
  // updating the list length label only AFTER fully populating the list 
  updateListLengthLabel();
}

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

// functionality to toggle overlay
let overlayStatus = true; // overlay defaults to one
const overlay = document.getElementById("screenshot-overlay");
const overlayToggle = document.getElementById("overlay-toggle");
// toggling based on simple event listener
overlayToggle.addEventListener("click", () => {
  // if overlay was OFF before being clicked
  if (overlay.style.display == 'none') {
    overlay.style.display = 'block';
    overlayStatus = true;
    existingAlert = document.querySelector("calcite-alert")
    if(existingAlert) existingAlert.remove();
    
    // if overlay was ON before being clicked
  } else {
    overlay.style.display = 'none';
    overlayStatus = false;
  }
  // console.log("Overlay status:", overlayStatus)
});

// grabbing the container that holds our maps, we'll put warning over maps if screenshot is selected with overlay OFF
const screenshotButton = document.getElementById("screenshot-button");
if (screenshotButton) {
  screenshotButton.addEventListener("click", captureScreenshot);
} else {
  console.warn("screenshot-button element not found in DOM.");
}

// functionality for adding a screenshot warning if the overlay is turned off
function showScreenshotWarning() {
  // Remove any existing alert
  existingAlert = document.querySelector("calcite-alert")
  if(existingAlert) existingAlert.remove();

  const screenshotWarning = document.createElement("calcite-alert");
  screenshotWarning.open = true;
  screenshotWarning.kind = "warning";
  screenshotWarning.autoDismiss = true;

  const title = document.createElement("calcite-alert-message");
  title.textContent = "Overlay must be ENABLED (it will not be captured in screenshot).";
  title.slot = "title";
  screenshotWarning.appendChild(title);


  // Append somewhere that won't affect map layout
  document.body.appendChild(screenshotWarning);
}
// Functionality for capturing screenshot
async function captureScreenshot() {
  
  // if the overlay is OFF when the screenshot button is clicked, we want to warn the user
  if (!overlayStatus) {
    showScreenshotWarning();
    return; // stop screenshot process

  // otherwise, the overlay is ON, so we'll capture the screenshot
  } else {
    console.log("Overlay is on, capturing screenshot.")
    
    // grabbing the overlay rectangle's in screenspace
    const overlayRectangle = overlay.getBoundingClientRect();
    
    // calculate intersection between two rectangles to determine what part of each map view is within the overlay
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

      const viewRect = view.container.getBoundingClientRect();
      const intersection = intersectRects(overlayRectangle, viewRect);
      if (!intersection) {
        console.log(`${name} view: no DOM intersection with overlay`);
        return null;
      }

      // convert the overlay intersection (screen coords) into map coords
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
      console.log(`Extent for map within ${name} view is`, view.extent)
      console.log(`Extent for OVERLAY within ${name} view is`, overlayExtent)

      // if layer has no fullExtent, skip geographic test and proceed
      if (layer.fullExtent) {
        const intersects = geometryEngine.intersects(overlayExtent, layer.fullExtent);
        if (!intersects) {
          console.log(`${name} view: overlay does not intersect layer geographic extent`);
          return null;
        }
      }

      // area relative to this view's top-left (unchanged)
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

// functionality for resetting views
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

// functionality for showing/hiding search 
let showSearch = false;
let tractSearchWidget = null; // store reference

const searchButton = document.getElementById("show-search");
if (searchButton) {
  searchButton.addEventListener("click", () => {
    if (showSearch) {
      // Remove the search widget
      if (tractSearchWidget) {
        tractView.ui.remove(tractSearchWidget);
      }
      showSearch = false;
      searchButton.textContent = "Show Search";
      searchButton.iconStart = "magnifying-glass-plus";
    } else {
      // Create it only if it doesn't exist yet
      if (!tractSearchWidget) {
        tractSearchWidget = new Search({ view: tractView });
      }
      tractView.ui.add(tractSearchWidget, "top-right");
      showSearch = true;
      searchButton.textContent = "Hide Search";
      searchButton.iconStart = "magnifying-glass-minus";
    }
    console.log("Search status is:", showSearch);
  });
} else {
  console.warn("search-hide element not found in DOM.");
}

