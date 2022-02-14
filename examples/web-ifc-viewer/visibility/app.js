import { IfcViewerAPI } from 'web-ifc-viewer';

const container = document.getElementById('viewer-container');
const viewer = new IfcViewerAPI({ container });
viewer.grid.setGrid();
viewer.axes.setAxes();

viewer.IFC.setWasmPath("../../../");

const input = document.getElementById("file-input");

async function loadIFC() {
  await viewer.IFC.loadIfcUrl("../../../IFC/01.ifc");
}

loadIFC();

