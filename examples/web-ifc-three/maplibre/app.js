import { Group } from "three";
import {
  Matrix4,
  Vector3,
  AmbientLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  MeshLambertMaterial,
} from "three";
import {
	acceleratedRaycast,
	computeBoundsTree,
	disposeBoundsTree,
} from 'three-mesh-bvh';
import { IFCLoader } from "web-ifc-three/IFCLoader";

import { RaycastMaplibre } from "./RaycastMapLibre";

const map = new maplibregl.Map({
  container: "map",
  style:
    "https://api.maptiler.com/maps/basic/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL",
  zoom: 20.5,
  center: [13.4453, 52.491],
  pitch: 75,
  bearing: -80,
  hash: true,
  maxZoom: 24,
  maxPitch: 75,
  antialias: true,
});

const modelOrigin = [13.4453, 52.491];
const modelAltitude = 0;

const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
  modelOrigin,
  modelAltitude
);

const camera = new PerspectiveCamera();

const cameraTransform = new Matrix4()
  .makeTranslation(
    modelAsMercatorCoordinate.x,
    modelAsMercatorCoordinate.y,
    modelAsMercatorCoordinate.z
  )
  .scale(new Vector3(1, -1, 1));

const scene = new Scene();

const ifcLoader = new IFCLoader();
const ifcModelsGroup = new Group();
scene.add(ifcModelsGroup);

const renderer = new WebGLRenderer({
  canvas: map.getCanvas(),
  antialias: true,
});
renderer.autoClear = false;

const customLayer = {
  id: "3d-model",
  type: "custom",
  renderingMode: "3d",

  onAdd: function () {
    ifcLoader.ifcManager.setWasmPath("../../../");
    ifcLoader.load("../../../IFC/01.ifc", function (model) {
      ifcModelsGroup.add(model);
    });

    ifcModelsGroup.rotateX(Math.PI / 2);
    ifcModelsGroup.rotateY(Math.PI / 4);
    ifcModelsGroup.scale.setScalar(
      modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
    );

    const ambientLight = new AmbientLight(0xffffff);

    scene.add(ambientLight);
  },
  render: function (gl, matrix) {
    camera.projectionMatrix = new Matrix4()

      .fromArray(matrix)
      .multiply(cameraTransform);
    renderer.resetState();
    renderer.render(scene, camera);
    map.triggerRepaint();
  },
};


map.on("style.load", () => {
  map.addLayer(customLayer);

  raycastHighlightStart();
});

function raycastHighlightStart() {
  ifcLoader.ifcManager.setupThreeMeshBVH(
    computeBoundsTree,
    disposeBoundsTree,
    acceleratedRaycast);
  const raycaster = new RaycastMaplibre(map, camera);

  let preselectModel = { id: -1 };

  const preselectMat = new MeshLambertMaterial({
    transparent: true,
    opacity: 0.6,
    color: 0xff88ff,
    depthTest: false,
  });

  map.on("mousemove", ({ point }) => {
    const intersects = raycaster.intersectObjectsFromPoint(
      point,
      ifcModelsGroup.children
    );

    const found = intersects[0];
    const ifc = ifcLoader.ifcManager;
    if (found) {
      const index = found.faceIndex;
      const geometry = found.object.geometry;
      const id = ifc.getExpressId(geometry, index);

      preselectModel.id = found.object.modelID;
      ifcLoader.ifcManager.createSubset({
        modelID: preselectModel.id,
        ids: [id],
        material: preselectMat,
        scene: ifcModelsGroup,
        removePrevious: true,
      });
    } else {
      ifc.removeSubset(preselectModel.id, preselectMat);
      preselectModel = { id: -1 };
    }
  });
}

