import { geometryTypes } from "./geometry-types";
import { IfcAPI, IFCRELSPACEBOUNDARY, IFCSPACE, IFCWINDOW, IFCDOOR, IFCWALL, IFCWALLSTANDARDCASE } from "web-ifc/web-ifc-api";
import {
    Vector3
} from "three";

const ifcapi = new IfcAPI();
ifcapi.SetWasmPath("../../../../");


const button = document.getElementById("file-opener-button");
button.addEventListener('click', () => input.click());

const leftContainer = document.getElementById("left-container");
const saveButton = document.getElementById("save-button");

const json = document.getElementById("json");

const input = document.getElementById("file-input");
input.addEventListener(
    "change",
    (changed) => {
        const reader = new FileReader();
        reader.onload = () => LoadFile(reader.result);
        reader.readAsText(changed.target.files[0]);
    },
    false
);

async function LoadFile(ifcAsText) {
    leftContainer.innerHTML = ifcAsText.replace(/(?:\r\n|\r|\n)/g, '<br>');
    const uint8array = new TextEncoder().encode(ifcAsText);
    const modelID = await OpenIfc(uint8array);

    function generateUniqueId() {
        let id = "";
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 8; i++) {
            const randomIndex = Math.floor(Math.random() * chars.length);
            id += chars[randomIndex];
        }
        return id;
    }

    function boundaryMapping(bc) {
        if (bc == "EXTERNAL") {
            return { "type": "Outdoors", "boundary_condition_objects": [] };
        } else if (bc == "INTERNAL") {
            return { "type": "Surface", "boundary_condition_objects": [] };
        }
    }

    function equalTolerance(num1, num2, tolerance) {
        return Math.abs(num1 - num2) <= tolerance;
    }

    function processGeometry(boundary) {
        // Getting relating space and related element from the IfcRelDefineBoundary instance
        let relatingSpaceId = boundary.RelatingSpace.value;
        let relatingSpace = ifcapi.GetLine(modelID, boundary.RelatingSpace.value);

        let relatedBuildingElementId = boundary.RelatedBuildingElement.value;
        let relatedBuildingElement = ifcapi.GetLine(modelID, relatedBuildingElementId);

        // Process the geometry information 
        let connectionGeometryId = boundary.ConnectionGeometry["value"];
        let connectionGeometry = ifcapi.GetLine(modelID, connectionGeometryId);

        let curvedBoundedPlaneId = connectionGeometry.SurfaceOnRelatingElement["value"];
        let cbp = ifcapi.GetLine(modelID, curvedBoundedPlaneId);

        // Process IfcCurveBoundedPlane instance
        let plane = ifcapi.GetLine(modelID, cbp["BasisSurface"]["value"]);

        let axisPlacementId = plane.Position.value
        let C = ifcapi.GetLine(modelID, ifcapi.GetLine(modelID, axisPlacementId).Location.value).Coordinates;
        let C_vec = [];
        C.map((e) => { C_vec.push(e.value) })

        let xDir = ifcapi.GetLine(modelID, ifcapi.GetLine(modelID, axisPlacementId).RefDirection.value).DirectionRatios;
        let xVec = [];
        xDir.map((e) => { xVec.push(e.value) })

        let zDir = ifcapi.GetLine(modelID, ifcapi.GetLine(modelID, axisPlacementId).Axis.value).DirectionRatios;
        let zVec = [];
        zDir.map((e) => { zVec.push(e.value) })

        // Cross product
        yVec = [
            zVec[1] * xVec[2] - zVec[2] * xVec[1],
            zVec[2] * xVec[0] - zVec[0] * xVec[2],
            zVec[0] * xVec[1] - zVec[1] * xVec[0]
        ]

        // Outer Boundary   
        let outerPoints = [];

        let obPoints = [];
        ob = ifcapi.GetLine(modelID, cbp.OuterBoundary.value);

        ob.Points.map((point) => {
            obPoints.push([ifcapi.GetLine(modelID, point.value).Coordinates[0].value, ifcapi.GetLine(modelID, point.value).Coordinates[1].value]);
        })

        obPoints.map((point) => {
            let u = point[0];
            let v = point[1];

            px = C_vec[0] + u * xVec[0] + v * yVec[0];
            py = C_vec[1] + u * xVec[1] + v * yVec[1];
            pz = C_vec[2] + u * xVec[2] + v * yVec[2];
            outerPoints.push([px, py, pz]);

        })

        // Holes
        holes = []
        if (cbp.InnerBoundaries) {

            cbp.InnerBoundaries.map((ib) => {

                let ibPoints = [];
                ib = ifcapi.GetLine(modelID, ib.value);
                ib.Points.map((point) => {
                    ibPoints.push([ifcapi.GetLine(modelID, point.value).Coordinates[0].value, ifcapi.GetLine(modelID, point.value).Coordinates[1].value]);
                })

                innerPoints = []
                ibPoints.map((point) => {
                    let u = point[0];
                    let v = point[1];

                    px = C_vec[0] + u * xVec[0] + v * yVec[0];
                    py = C_vec[1] + u * xVec[1] + v * yVec[1];
                    pz = C_vec[2] + u * xVec[2] + v * yVec[2];
                    innerPoints.push([px, py, pz]);

                })

                holes.push(innerPoints);

            })
        }

        return { "outerPoints": outerPoints, "holes": holes, plane: { n: zVec, o: C_vec, x: xVec } }
    }


    let lines = ifcapi.GetLineIDsWithType(modelID, IFCSPACE);

    let lineSize = lines.size();
    let spaces = [];
    for (let i = 0; i < lineSize; i++) {
        // Getting the ElementID from Lines
        let relatedID = lines.get(i);

        // Getting Element Data using the relatedID
        let relDefProps = ifcapi.GetLine(modelID, relatedID);
        spaces.push(relDefProps);
    }

    let FACES = [];

    let space2room = {};
    let room2index = {};
    let initalRooms = [];

    spaces.map((space, i) => {
        let roomId = generateUniqueId();
        space2room[space.expressID] = roomId;
        room2index[roomId] = i;
        initalRooms.push({ identifier: roomId, faces: [], type: "Room", "properties": "RoomPropertiesAbridged" });
    })

    let hbjson = {
        rooms: initalRooms
    };

    // Get the parent and children boundaries
    let linesBoundaries = ifcapi.GetLineIDsWithType(modelID, IFCRELSPACEBOUNDARY);

    let faceBoundaries = []; // walls and slabs
    let otherBoundaries = []; // windows and doors

    for (let i = 0; i < linesBoundaries.size(); i++) {
        let relatedID = linesBoundaries.get(i);
        let boundary = ifcapi.GetLine(modelID, relatedID);

        let relatedElementId = boundary.RelatedBuildingElement;
        let relatedElement = ifcapi.GetLine(modelID, relatedElementId.value);

        let ifcType = relatedElement.constructor.name;
        if (ifcType.includes("IfcWall") || ifcType.includes("IfcSlab")) {
            faceBoundaries.push(boundary);
        } else if (ifcType == "IfcDoor" || ifcType == "IfcWindow") {
            otherBoundaries.push(boundary);
        }
    }

    let face2Ifc = {}
    let ifc2Face = {}
    let face2space = {}

    let walls = ifcapi.GetLineIDsWithType(modelID, IFCWALLSTANDARDCASE);
    let wallStore = [];
    for (let i = 0; i < walls.size(); i++) {
        let relatedID = walls.get(i);
        let wall = ifcapi.GetLine(modelID, relatedID);
        wallStore.push(wall);
    }

    // Create window to wall mapping
    window2wall = {}
    let windows = ifcapi.GetLineIDsWithType(modelID, IFCWINDOW);
    for (let i = 0; i < windows.size(); i++) {
        let relatedID = windows.get(i);
        let win = ifcapi.GetLine(modelID, relatedID);

        winObjectPlacement = ifcapi.GetLine(modelID, win.ObjectPlacement.value);

        openingPlacement = ifcapi.GetLine(modelID, winObjectPlacement.PlacementRelTo.value);

        wallPlacement = ifcapi.GetLine(modelID, openingPlacement.PlacementRelTo.value);

        wallStore.map((wall) => {
            if (wallPlacement.expressID == wall.ObjectPlacement.value) {
                const winExpressID = `${win.expressID}`;
                const wallExpressID = `${wall.expressID}`;

                if (winExpressID in window2wall) {
                    window2wall[winExpressID].push(wallExpressID)
                } else {
                    window2wall[winExpressID] = [wallExpressID];
                }
            }
        })
    }

    // Create door to wall mapping
    door2wall = {}
    let doors = ifcapi.GetLineIDsWithType(modelID, IFCDOOR);

    for (let i = 0; i < doors.size(); i++) {
        let relatedID = doors.get(i);
        let win = ifcapi.GetLine(modelID, relatedID);

        winObjectPlacement = ifcapi.GetLine(modelID, win.ObjectPlacement.value);
        openingPlacement = ifcapi.GetLine(modelID, winObjectPlacement.PlacementRelTo.value);
        wallPlacement = ifcapi.GetLine(modelID, openingPlacement.PlacementRelTo.value);

        wallStore.map((wall) => {
            if (wallPlacement.expressID == wall.ObjectPlacement.value) {
                const winExpressID = `${win.expressID}`;
                const wallExpressID = `${wall.expressID}`;

                if (winExpressID in window2wall) {
                    door2wall[winExpressID].push(wallExpressID)
                } else {
                    door2wall[winExpressID] = [wallExpressID];
                }
            }
        })
    }

    // Process the parent faces
    FACES_MAPPING = {}
    faceBoundaries.map((boundary) => {

        // Get relating space and related element from the IfcRelDefineBoundary instance
        let relatingSpaceId = boundary.RelatingSpace.value;
        let relatingSpace = ifcapi.GetLine(modelID, boundary.RelatingSpace.value);

        let relatedBuildingElementId = boundary.RelatedBuildingElement.value;
        let relatedBuildingElement = ifcapi.GetLine(modelID, relatedBuildingElementId);

        let processedGeometry = processGeometry(boundary);

        let faceId = generateUniqueId();

        face2space[faceId] = relatingSpaceId;

        // Compute the type and map the wall
        let faceType;

        if (relatedBuildingElement.constructor.name.includes("IfcWall")) {
            faceType = "Wall";
            if (relatedBuildingElement.expressID in ifc2Face) {
                ifc2Face[relatedBuildingElement.expressID].push(faceId);
            } else {
                ifc2Face[relatedBuildingElement.expressID] = [faceId];
            }

            face2Ifc[faceId] = relatedBuildingElement.expressID;
        }
        if (relatedBuildingElement.constructor.name == "IfcSlab") {
            if (relatedBuildingElement.PredefinedType.value == "FLOOR") {
                faceType = "Floor";
            }
        }

        let face =
        {
            "identifier": faceId,
            "type": "Face",
            "geometry": {
                "type": "Face3D",
                "boundary": processedGeometry.outerPoints,
                // "holes": processedGeometry.holes // Holes for windows/doors should not be stored there
            },
            "plane": processedGeometry.plane,
            "face_type": faceType,
            "boundary_condition": boundaryMapping(boundary.InternalOrExternalBoundary.value),
            "apertures": [],
            "doors": [],
            "properties": "FacePropertiesAbridged"
        }

        FACES.push(face);

    })

    // Process the subfaces (apertures and doors)
    let SUBFACES = [];
    otherBoundaries.map((boundary) => {

        // Get relating space and related element from the IfcRelDefineBoundary instance
        let relatingSpaceId = boundary.RelatingSpace.value;
        let relatingSpace = ifcapi.GetLine(modelID, boundary.RelatingSpace.value);

        let relatedBuildingElementId = boundary.RelatedBuildingElement.value;
        let relatedBuildingElement = ifcapi.GetLine(modelID, relatedBuildingElementId);

        let processedGeometry = processGeometry(boundary);

        let faceId = generateUniqueId();

        face2space[faceId] = relatingSpaceId;

        // Compute the type and retrieve the hosting wall
        let faceType;
        let parentFace;
        let properties;

        let hostingWall;
        if (relatedBuildingElement.constructor.name == "IfcWindow") {
            hostingWall = window2wall[relatedBuildingElementId][0];
            parentFace = ifc2Face[hostingWall];
            faceType = "Aperture";
            properties = "AperturePropertiesAbridged";

        }
        if (relatedBuildingElement.constructor.name == "IfcDoor") {
            hostingWall = door2wall[relatedBuildingElementId][0];
            parentFace = ifc2Face[hostingWall];
            faceType = "Door";
            properties = "DoorPropertiesAbridged";
        }

        let face =
        {
            "identifier": faceId,
            "type": faceType,
            "geometry": {
                "type": "Face3D",
                "boundary": processedGeometry.outerPoints,
                "holes": processedGeometry.holes,
            },
            "plane": processedGeometry.plane,
            "boundary_condition": boundaryMapping(boundary.InternalOrExternalBoundary.value),
            "properties": properties
        }

        SUBFACES.push(face)

    })

    FACES.map((face) => {
        FACES_MAPPING[face.identifier] = { ...face, subfaces: [] };
    })

    // Match subfaces to faces by comparing each subface with the faces of the same room
    let subface2face = {}
    let subface2Index = {}

    const eps = 1e-10;
    SUBFACES.map((subface) => {
        FACES.map((face) => {

            if (face2space[subface.identifier] == face2space[face.identifier] && face.face_type == "Wall") {
                // Test whether subface and face planes are coplanar
                let subfaceNormal = new Vector3().fromArray(subface.plane.n);
                let faceNormal = new Vector3().fromArray(face.plane.n);
                let cp = subfaceNormal.cross(faceNormal);

                if (cp.length() == 0) {
                    // Test whether subface is contained in face
                    // Check that each point of the subface is contained in the face
                    let faceOrigin = new Vector3().fromArray(face.plane.o);
                    let d = faceNormal.dot(faceOrigin.negate());

                    let pointNumber = subface.geometry.boundary.length;
                    let numberOnPlane = 0;

                    subface.geometry.boundary.map((pt) => {
                        let point = new Vector3().fromArray(pt);

                        let projection = faceNormal.dot(point) + d;

                        if (Math.abs(projection) < eps) {
                            numberOnPlane += 1;
                        }
                    })

                    if (pointNumber == numberOnPlane) {
                        subface2face[subface.identifier] = face.identifier;
                        FACES_MAPPING[face.identifier].subfaces.push(subface)

                        if (subface.type == "Aperture") {
                            FACES_MAPPING[face.identifier].apertures.push(subface);
                            subface2Index[subface.identifier] = FACES_MAPPING[face.identifier].apertures.length - 1
                        } else if (subface.type == "Door") {
                            FACES_MAPPING[face.identifier].doors.push(subface);
                            subface2Index[subface.identifier] = FACES_MAPPING[face.identifier].doors.length - 1
                        }
                    }
                }
            }
        })
    })

    // Match subfaces to subfaces of Surface boundary conditions
    SUBFACES.map((subface) => {
        if ((subface.type == "Door" || subface.type == "Aperture") && subface.boundary_condition.type == "Surface") {

            // Get the parent face
            if (subface.type == "Door") {
                SUBFACES.map((doorFace) => {
                    if (subface.type == doorFace.type && subface.identifier != doorFace.identifier) {
                        let subfaceNormal = new Vector3().fromArray(subface.plane.n);
                        let doorFaceNormal = new Vector3().fromArray(doorFace.plane.n);

                        // Let's compare the normals, if they are changing over one direction only, the subfaces are parallel
                        if (subfaceNormal.dot(doorFaceNormal) == -1) {
                            let differingDimension;
                            if (subfaceNormal.x != doorFaceNormal.x) { differingDimension = 0; }
                            if (subfaceNormal.y != doorFaceNormal.y) { differingDimension = 1; }
                            if (subfaceNormal.z != doorFaceNormal.z) { differingDimension = 2; }

                            // Now let's find if the point coordinates only differ at the dimension where the normals differ
                            // If they do, the subfaces are sibling
                            let sumSubface = [0, 0, 0];
                            let sumDoorface = [0, 0, 0];

                            subface.geometry.boundary.map((point) => {
                                sumSubface[0] += point[0];
                                sumSubface[1] += point[1];
                                sumSubface[2] += point[2];
                            })

                            doorFace.geometry.boundary.map((point) => {
                                sumDoorface[0] += point[0];
                                sumDoorface[1] += point[1];
                                sumDoorface[2] += point[2];

                            })

                            let xMatch = equalTolerance(sumSubface[0], sumDoorface[0], eps);
                            let yMatch = equalTolerance(sumSubface[1], sumDoorface[1], eps);
                            let zMatch = equalTolerance(sumSubface[2], sumDoorface[2], eps);

                            let sibling = false;

                            if (differingDimension == 0) {
                                if (!xMatch && yMatch && zMatch) {
                                    sibling = true;
                                }
                            }

                            if (differingDimension == 1) {
                                if (!yMatch && xMatch && zMatch) {
                                    sibling = true;
                                }

                            }

                            if (differingDimension == 2) {
                                if (!zMatch && xMatch && yMatch) {
                                    sibling = true;
                                }
                            }

                            // Add the boundary condition to both subfaces
                            if (sibling) {
                                boundary_condition_subface = {
                                    type: "Surface",
                                    boundary_condition_objects: [
                                        doorFace.identifier,
                                        FACES_MAPPING[subface2face[doorFace.identifier]].identifier,
                                        space2room[face2space[FACES_MAPPING[subface2face[doorFace.identifier]].identifier]]
                                    ]
                                }

                                boundary_condition_doorface = {
                                    type: "Surface",
                                    boundary_condition_objects: [
                                        subface.identifier,
                                        FACES_MAPPING[subface2face[subface.identifier]].identifier,
                                        space2room[face2space[FACES_MAPPING[subface2face[subface.identifier]].identifier]]
                                    ]
                                }

                                // Access the subface from the face object and add the boundary condition
                                FACES_MAPPING[subface2face[subface.identifier]].doors[subface2Index[subface.identifier]]["boundary_condition"] = boundary_condition_subface;
                                FACES_MAPPING[subface2face[doorFace.identifier]].doors[subface2Index[doorFace.identifier]]["boundary_condition"] = boundary_condition_doorface;
                            }
                        }
                    }
                })
            }
        }
    })
   
    Object.entries(FACES_MAPPING).map(([key, face]) => {
        let faceId = face2space[face.identifier];
        let roomId = space2room[faceId];
        hbjson.rooms[room2index[roomId]].faces.push(face);
    })

    
    // Save the HBJSON file
    const allItems = GetAllItems(modelID);
    const result = JSON.stringify(hbjson, undefined, 2);
    json.textContent = result;

    const blob = new Blob([result], { type: "application/json" });
    saveButton.href = URL.createObjectURL(blob);
    saveButton.download = "model.hbjson";
    saveButton.click();

    ifcapi.CloseModel(modelID);
}

async function OpenIfc(ifcAsText) {
    await ifcapi.Init();
    return ifcapi.OpenModel(ifcAsText);
}

function GetAllItems(modelID, excludeGeometry = true) {
    const allItems = {};
    const lines = ifcapi.GetAllLines(modelID);
    getAllItemsFromLines(modelID, lines, allItems, excludeGeometry);
    return allItems;
}

function getAllItemsFromLines(modelID, lines, allItems, excludeGeometry) {
    for (let i = 1; i <= lines.size(); i++) {
        try {
            saveProperties(modelID, lines, allItems, excludeGeometry, i);
        } catch (e) {
            console.log(e);
        }
    }
}

function saveProperties(modelID, lines, allItems, excludeGeometry, index) {
    const itemID = lines.get(index);
    const props = ifcapi.GetLine(modelID, itemID);

    props.type = props.__proto__.constructor.name;

    if (!excludeGeometry || !geometryTypes.has(props.type)) {
        allItems[itemID] = props;
    }
}