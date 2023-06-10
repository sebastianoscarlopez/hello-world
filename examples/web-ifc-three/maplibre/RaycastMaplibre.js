import { Raycaster, Matrix4, Vector2, Vector3 } from "three";

export class RaycastMaplibre {
  constructor(map, camera) {
    this.map = map;
    this.camera = camera;
    this.raycaster = new Raycaster();
    this.raycaster.firstHitOnly = true;
  }

  intersectObjectsFromPoint(screenPoint, objects) {
    const { size } = this.map.transform;

    var pointNormalized = new Vector2();
    pointNormalized.x = (screenPoint.x / size.x) * 2 - 1;
    pointNormalized.y = 1 - (screenPoint.y / size.y) * 2;

    const camInverseProjection = new Matrix4()
      .copy(this.camera.projectionMatrix)
      .invert();

    const cameraPosition = new Vector3().applyMatrix4(camInverseProjection);
    const viewDirection = new Vector3(pointNormalized.x, pointNormalized.y, 1)
      .applyMatrix4(camInverseProjection)
      .sub(cameraPosition)
      .normalize();

    this.raycaster.set(cameraPosition, viewDirection);

    return this.raycaster.intersectObjects(objects, true);
  }
}
