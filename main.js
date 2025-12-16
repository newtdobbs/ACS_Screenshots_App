import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import PortalItem from "@arcgis/core/portal/PortalItem.js";
import Basemap from "@arcgis/core/Basemap.js";
import TileLayer from "@arcgis/core/layers/TileLayer.js";

const itemIDs = [
  '23ab8028f1784de4b0810104cd5d1c8f',
  '45ede6d6ff7e4cbbbffa60d34227e462',
  '0e468b75bca545ee8dc4b039cbb5aff6',
  '84e3022a376e41feb4dd8addf25835a3',
  'f430d25bf03744edbb1579e18c4bf6b8',
  '2de116f62be54987b63b978c06a0a085',
  '7c69956008bb4019bbbe67ed9fb05dbb',
  'ab08335514884c1f834e4cc43fb55c51',
  'babfd093d1f645e092edcb2cf301eaab',
  '5522b6f6d6eb48e6ac33164657c6d7a0',
];


let stateView = null;
let countyView = null;
let tractView = null;

// small function for cleaning up screenshot names
function convertToScreenshotName(t){
  return t.replace(/\s*-\s*/g, '_').replace(/\s+/g, '_') + ".png";
}

// setting Kansas City as default center as its ~roughly~ central in US
const default_center = [-94.66, 39.04]

// screenshot name variable to be used when saving files
let screenshotName = "";

// regex to remove geography level suffixes from ACS layer titles (state, county, tract) 
const wordsToRemove = ['State', 'County', 'Tract'];
const regex = new RegExp(`\\s-\\s(?:${wordsToRemove.join("|")})$`, "i");

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
  // updating screenshot name with layer title but dropping the geography level suffix
  screenshotName = l.title.replace(regex, "").replace(/\s+/g, '_') + ".png";
  // zooming to visibility mid scale and center of country 
  v.goTo({ scale: midScale, center: default_center });
}

// function to create a map view using the layers associated with the given AGOL item id.
// though sublayerIDs is an array, it will only contain one value per view (state, county, or tract)
async function createView(containerId, itemId, sublayerIds, rangeKey) {

  // creating a map using the list of layers for the agol item ID
  const map = new Map({
    basemap: "gray", // may end up changing this
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

// defaulting to fill our maps with the first item in the list
const listGroup = document.getElementById("list-group");
(async () => {

  // Populate dropdown after views are ready
  if (!listGroup) return;
  for (const id of itemIDs) {
    const title = await getItemTitle(id);
    const listItem = document.createElement("calcite-list-item");
    listItem.label = title;
    listItem.value = id;

    // we'll load the first list item by default
    if (itemIDs[0] === id) {
      console.log("====================== Selected ID:", id, "======================");
      listItem.selected = true;
      screenshotName = convertToScreenshotName(title);
      console.log("SCRREENSHOT NAME DEFAULT: ", screenshotName);
      await loadSelectedItem(id);
    }
    
    listItem.addEventListener("click", async () => {
      console.log("====================== Selected ID:", id, "======================");
      screenshotName = convertToScreenshotName(title);
      console.log("SCRREENSHOT NAME UPDATED TO: ", screenshotName);
      await updateViewsForItem(id);
    });

    listGroup.appendChild(listItem);
}
})();

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
  }
}

// functionality to toggle overlay
const overlay = document.getElementById("screenshot-overlay");
const overlayToggle = document.getElementById("overlay-toggle");
// toggling based on simple event listener
overlayToggle.addEventListener("click", () => {
  if (overlay.style.display == 'none') {
    overlay.style.display = 'block';
  } else {
    overlay.style.display = 'none';
  }
});

// Functionality for capturing screenshot
const screenshotButton = document.getElementById("screenshot-button");
if (screenshotButton) {
  screenshotButton.addEventListener("click", captureScreenshot);
} else {
  console.warn("screenshot-button element not found in DOM.");
}
async function captureScreenshot() {
  
  
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
  
  // prepare screenshot promises only for views that intersect the overlay
  const shotsInfo = await Promise.all(
    views.map(async ({ view, name }) => {
      if (!view) return null;
      await view.when();
      const viewRect = view.container.getBoundingClientRect();
      const intersection = intersectRects(overlayRectangle, viewRect);
      if (!intersection) {
        console.log(`${name} view: no intersection with overlay`);
        return null;
      }
      
      // calculating overlapping area relative to this view's top-left
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

// functionality for locking views