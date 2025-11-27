let MAP_BOUNDS = {
    minX: -50,
    maxX: 1500,
    minZ: -50,
    maxZ: 1500
};

const SCALES = {
    CITY: 1.0,
    TAXI: 10,
    PASSENGER: 0.2
};

const CITY_CONFIG = {
    GRID_SIZE: 7,           
    CELL_WIDTH: 10,         
    CELL_DEPTH: 10,         
    T3_SCALE: 20,   
    
    BUILDING_TYPES: ['Block', 'Classic', 'RoundBlock', 'Park'],
    BUILDING_PROBABILITY: [0, 0.7, 0.8, 0.9, 1],
    BUILDING_MAX: [Infinity, Infinity, 1, 1],
    
    BUILDING_MIN_HEIGHT: 15,
    BUILDING_MAX_HEIGHT: 60,
    
    BUILDING_COLORS: [
        0x8B7355, 0x9C8B7A, 0xA69585, 0x7D6B5D,
        0xB8A99A, 0x6B5B4F, 0xC4B5A6, 0x5D4E42,
        0x8B8378, 0x9E9589, 0xA9A095, 0x7A7168,
        0xD4C4B5, 0x6E5F52, 0xBFB0A1, 0x584A3E
    ],
    
    ROAD_COLOR: 0x3a3a3a,
    GROUND_COLOR: 0x2a2a2a,
    SIDEWALK_COLOR: 0x666666,
    
    SKYBOX_ENABLED: true,
    HORIZON_COLOR: 0x87CEEB,
    GROUND_HORIZON_COLOR: 0x4a7c4e
};

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let scene, camera, renderer, taxiModel, cityModel;
let keys = {};
let velocity = new THREE.Vector3(0, 0, 0);
let rotation = 0;
let money = 250;
let gameTime = 6;
let passengers = [];
let trafficLights = [];
let currentPassenger = null;
let gameState = 'free';
let destinationMarker = null;
let destinationArrow = null;
let cityCollisionMeshes = [];
let buildingCollisionBoxes = [];
let groundMeshes = [];
let roadMeshes = [];
let isOnRoad = false;

let lamps = [];

let gridRows = [];
let gridCols = [];

const PHYSICS = {
    ACCELERATION: 0.08,
    BRAKE_POWER: 0.02,
    MAX_SPEED: 5.0,
    REVERSE_SPEED: 0.5,
    TURN_SPEED: 0.024,
    FRICTION: 0.994,
    COLLISION_BOUNCE: 0.03,
    GROUND_HEIGHT: 8,
    COLLISION_DISTANCE: 5.0,
    BUILDING_SIDE_CHECK: 3.0
};

const CAMERA_CONFIG = {
    DISTANCE: 80,
    HEIGHT: 40,
    ANGLE: 0.3,
    LERP_SPEED: 0.12,
    LOOK_AT_HEIGHT: 10,
    FOV: 65
};
// ============================================================================
// PASSENGER TYPES
// ============================================================================
const PASSENGER_TYPES = {
    businessman: { 
        multiplier: 1.5, 
        name: 'Businessman',
        color: 0x2C3E50,
        tipMultiplier: 1.8
    },
    tourist: { 
        multiplier: 1.0, 
        name: 'Tourist',
        color: 0xE74C3C,
        tipMultiplier: 1.2
    },
    student: { 
        multiplier: 0.8, 
        name: 'Student',
        color: 0x27AE60,
        tipMultiplier: 0.6
    }
};

async function init() {
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0xc9dae6, 100, 1500);
    
    camera = new THREE.PerspectiveCamera(
        CAMERA_CONFIG.FOV,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
    );
    camera.position.set(0, CAMERA_CONFIG.HEIGHT, CAMERA_CONFIG.DISTANCE);
    
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: true,
        alpha: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    createSkyboxAndHorizon();
    setupLights();
    await loadAllModels();
    setupControls();
    setupMinimapToggle();
    
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
    
    animate();
}

function setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xffffee, 0.9);
    sun.position.set(200, 300, 150);
    sun.castShadow = true;
    sun.shadow.camera.left = -500;
    sun.shadow.camera.right = 500;
    sun.shadow.camera.top = 500;
    sun.shadow.camera.bottom = -500;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0001;
    scene.add(sun);
    
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x3a5f3a, 0.4);
    scene.add(hemisphereLight);
}

function createSkyboxAndHorizon() {
    const skyGeo = new THREE.SphereGeometry(1500, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x4a90c2) },
            bottomColor: { value: new THREE.Color(0xc9dae6) },
            horizonColor: { value: new THREE.Color(0xe8d5a3) },
            offset: { value: 20 },
            exponent: { value: 0.4 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform vec3 horizonColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition + offset).y;
                float horizonBlend = 1.0 - abs(h);
                horizonBlend = pow(horizonBlend, 3.0);
                vec3 skyColor = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));
                skyColor = mix(skyColor, horizonColor, horizonBlend * 0.5);
                gl_FragColor = vec4(skyColor, 1.0);
            }
        `,
        side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    
    createHorizonTrees();
    
    createDistantMountains();
}

function createHorizonTrees() {
    const treeLineDistance = 1200;
    const treeCount = 200;
    
    for (let i = 0; i < treeCount; i++) {
        const angle = (i / treeCount) * Math.PI * 2;
        const x = Math.cos(angle) * treeLineDistance;
        const z = Math.sin(angle) * treeLineDistance;
        
        const height = 20 + Math.random() * 40;
        const width = 8 + Math.random() * 15;
        
        const treeGeo = new THREE.ConeGeometry(width, height, 4);
        const treeMat = new THREE.MeshBasicMaterial({ 
            color: 0x1a3d1a,
            fog: true
        });
        const tree = new THREE.Mesh(treeGeo, treeMat);
        tree.position.set(x, height / 2, z);
        tree.rotation.y = Math.random() * Math.PI;
        scene.add(tree);
    }
}

function createDistantMountains() {
    const mountainDistance = 1400;
    const mountainCount = 30;
    
    for (let i = 0; i < mountainCount; i++) {
        const angle = (i / mountainCount) * Math.PI * 2;
        const x = Math.cos(angle) * mountainDistance;
        const z = Math.sin(angle) * mountainDistance;
        
        const height = 80 + Math.random() * 120;
        const width = 100 + Math.random() * 150;
        
        const mountainGeo = new THREE.ConeGeometry(width, height, 4);
        const mountainMat = new THREE.MeshBasicMaterial({ 
            color: 0x3d5c3d,
            fog: true
        });
        const mountain = new THREE.Mesh(mountainGeo, mountainMat);
        mountain.position.set(x, height / 2 - 20, z);
        mountain.rotation.y = Math.random() * Math.PI;
        scene.add(mountain);
    }
}

function createWorldJSCity() {
    console.log('🏙️ Generating World.js style city (EXACT)...');
    
    const cityGroup = new THREE.Group();
    const gridSize = CITY_CONFIG.GRID_SIZE;
    const width = CITY_CONFIG.CELL_WIDTH;
    const depth = CITY_CONFIG.CELL_DEPTH;
    const scale = CITY_CONFIG.T3_SCALE;
    
    let rows = [];
    let cols = [];
    let total = 0;
    
    rows[total] = cols[total] = 0;
    total += 1;
    
    while (total < gridSize) {
        rows[total] = rows[total - 1] + 3 + Math.floor(Math.random() * 3);
        cols[total] = cols[total - 1] + 3 + Math.floor(Math.random() * 3);
        total += 1;
    }
    
    gridRows = rows;
    gridCols = cols;
    
    console.log('Grid rows:', rows);
    console.log('Grid cols:', cols);
    
    const lastRow = rows[rows.length - 1];
    const lastCol = cols[cols.length - 1];
    
    const groundWidth = (lastCol + 2) * width * scale;
    const groundDepth = (lastRow + 2) * depth * scale;
    
    const groundGeo = new THREE.PlaneGeometry(groundWidth, groundDepth);
    const groundMat = new THREE.MeshLambertMaterial({ color: CITY_CONFIG.GROUND_COLOR });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(groundWidth / 2 - width * scale, -0.5, groundDepth / 2 - depth * scale);
    ground.receiveShadow = true;
    cityGroup.add(ground);
    groundMeshes.push(ground);
    
    const models = CITY_CONFIG.BUILDING_TYPES;
    const probability = CITY_CONFIG.BUILDING_PROBABILITY;
    const max = CITY_CONFIG.BUILDING_MAX.slice(); 
    const current = [0, 0, 0, 0];
    
    let buildingCount = 0;
    
    for (let i = 0; i < gridSize - 1; i++) {
        for (let j = 0; j < gridSize - 1; j++) {
            let selected;
            let random;
            
            do {
                random = Math.random();
                for (let k = 0; k < probability.length - 1; k++) {
                    if (random >= probability[k] && random <= probability[k + 1]) {
                        selected = k;
                        break;
                    }
                }
            } while (current[selected] === max[selected]);
            
            current[selected] += 1;
            
            const x1 = cols[i] + 1;
            const z1 = rows[j] + 1;
            const x2 = cols[i + 1] - 1;
            const z2 = rows[j + 1] - 1;
            
            const building = createBuildingBlock(
                x1, z1, x2, z2,
                models[selected],
                width, depth, scale
            );
            
            if (building) {
                cityGroup.add(building.mesh);
                cityCollisionMeshes.push(building.mesh);
                buildingCollisionBoxes.push(building.box);
                buildingCount++;
            }
        }
    }
    
    createRoads(cityGroup, { rows, cols }, width, depth, scale);
    
    createLampParticles(cityGroup);
    
    MAP_BOUNDS = {
        minX: -width * scale,
        maxX: (lastCol + 1) * width * scale + width * scale,
        minZ: -depth * scale,
        maxZ: (lastRow + 1) * depth * scale + depth * scale
    };
    
    scene.add(cityGroup);
    cityModel = cityGroup;
    
    return { rows, cols };
}


function createBuildingBlock(x1, z1, x2, z2, modelType, cellWidth, cellDepth, scale) {
    // World.js: width = 10 * (x2 - x1 + 1), depth = 10 * (z2 - z1 + 1)
    const buildingWidth = cellWidth * (x2 - x1 + 1);
    const buildingDepth = cellDepth * (z2 - z1 + 1);
    
    let buildingGroup;
    
    switch (modelType) {
        case 'Block':
            buildingGroup = createBlockModel(buildingWidth, buildingDepth, scale);
            break;
        case 'Classic':
            buildingGroup = createClassicModel(buildingWidth, buildingDepth, scale);
            break;
        case 'RoundBlock':
            buildingGroup = createRoundBlockModel(buildingWidth, buildingDepth, scale);
            break;
        case 'Park':
            buildingGroup = createParkModel(buildingWidth, buildingDepth, scale);
            break;
        default:
            buildingGroup = createBlockModel(buildingWidth, buildingDepth, scale);
    }
    
    if (!buildingGroup) return null;
    
    const posX = x1 * cellWidth * scale + buildingWidth * scale / 2;
    const posZ = z1 * cellDepth * scale + buildingDepth * scale / 2;
    
    buildingGroup.position.set(posX, 0, posZ);
    
    const box = new THREE.Box3().setFromObject(buildingGroup);
    
    if (modelType !== 'Park') {
        lamps.push({
            position: new THREE.Vector3(posX, 0, posZ),
            width: buildingWidth,
            depth: buildingDepth
        });
    }
    
    return {
        mesh: buildingGroup,
        box: box,
        position: new THREE.Vector3(posX, 0, posZ),
        width: buildingWidth,
        depth: buildingDepth
    };
}

function createBlockModel(width, depth, scale) {
    const group = new THREE.Group();
    const color = CITY_CONFIG.BUILDING_COLORS[Math.floor(Math.random() * CITY_CONFIG.BUILDING_COLORS.length)];
    
    const height = CITY_CONFIG.BUILDING_MIN_HEIGHT + 
                   Math.random() * (CITY_CONFIG.BUILDING_MAX_HEIGHT - CITY_CONFIG.BUILDING_MIN_HEIGHT);
    
    const actualWidth = width * scale * 0.9;
    const actualDepth = depth * scale * 0.9;
    
    const buildingGeo = new THREE.BoxGeometry(actualWidth, height, actualDepth);
    const buildingMat = new THREE.MeshLambertMaterial({ color: color });
    const building = new THREE.Mesh(buildingGeo, buildingMat);
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
    
    const roofGeo = new THREE.BoxGeometry(actualWidth * 0.8, 3, actualDepth * 0.8);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = height + 1.5;
    roof.castShadow = true;
    group.add(roof);
    
    addWindowsToBlock(group, actualWidth, height, actualDepth, color);
    
    return group;
}

function createClassicModel(width, depth, scale) {
    const group = new THREE.Group();
    const baseColor = CITY_CONFIG.BUILDING_COLORS[Math.floor(Math.random() * CITY_CONFIG.BUILDING_COLORS.length)];
    
    const levels = 2 + Math.floor(Math.random() * 3);
    let currentHeight = 0;
    let currentWidth = width * scale * 0.9;
    let currentDepth = depth * scale * 0.9;
    
    for (let i = 0; i < levels; i++) {
        const levelHeight = 20 + Math.random() * 30;
        
        const color = new THREE.Color(baseColor);
        color.offsetHSL(0, 0, i * 0.03);
        
        const levelGeo = new THREE.BoxGeometry(currentWidth, levelHeight, currentDepth);
        const levelMat = new THREE.MeshLambertMaterial({ color: color });
        const level = new THREE.Mesh(levelGeo, levelMat);
        level.position.y = currentHeight + levelHeight / 2;
        level.castShadow = true;
        level.receiveShadow = true;
        group.add(level);
        
        currentHeight += levelHeight;
        currentWidth *= 0.8;
        currentDepth *= 0.8;
    }
    
    const spireGeo = new THREE.CylinderGeometry(0.5, 1, 15, 8);
    const spireMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.y = currentHeight + 7.5;
    spire.castShadow = true;
    group.add(spire);
    
    return group;
}

function createRoundBlockModel(width, depth, scale) {
    const group = new THREE.Group();
    const color = CITY_CONFIG.BUILDING_COLORS[Math.floor(Math.random() * CITY_CONFIG.BUILDING_COLORS.length)];
    
    const height = CITY_CONFIG.BUILDING_MIN_HEIGHT + 
                   Math.random() * (CITY_CONFIG.BUILDING_MAX_HEIGHT - CITY_CONFIG.BUILDING_MIN_HEIGHT);
    const radius = Math.min(width, depth) * scale * 0.4;
    
    const cylinderGeo = new THREE.CylinderGeometry(radius, radius * 1.05, height, 24);
    const cylinderMat = new THREE.MeshLambertMaterial({ color: color });
    const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
    cylinder.position.y = height / 2;
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    group.add(cylinder);
    
    const domeGeo = new THREE.SphereGeometry(radius * 0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = height;
    dome.castShadow = true;
    group.add(dome);
    
    return group;
}

function createParkModel(width, depth, scale) {
    const group = new THREE.Group();
    
    const actualWidth = width * scale * 0.95;
    const actualDepth = depth * scale * 0.95;
    
    const parkGeo = new THREE.PlaneGeometry(actualWidth, actualDepth);
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const park = new THREE.Mesh(parkGeo, parkMat);
    park.rotation.x = -Math.PI / 2;
    park.position.y = 0.1;
    park.receiveShadow = true;
    group.add(park);
    
    const pathGeo = new THREE.PlaneGeometry(actualWidth * 0.15, actualDepth);
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.15;
    group.add(path);
    
    const treeCount = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < treeCount; i++) {
        const tree = createTree();
        tree.position.set(
            (Math.random() - 0.5) * actualWidth * 0.8,
            0,
            (Math.random() - 0.5) * actualDepth * 0.8
        );
        if (Math.abs(tree.position.x) < actualWidth * 0.1) {
            tree.position.x += actualWidth * 0.2 * Math.sign(tree.position.x || 1);
        }
        group.add(tree);
    }
    
    for (let i = 0; i < 2; i++) {
        const bench = createBench();
        bench.position.set(
            actualWidth * 0.1 * (i === 0 ? 1 : -1),
            0,
            (Math.random() - 0.5) * actualDepth * 0.5
        );
        bench.rotation.y = i === 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(bench);
    }
    
    return group;
}

function createTree() {
    const group = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 5, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    group.add(trunk);
    
    const leavesGeo = new THREE.ConeGeometry(3, 6, 8);
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 7;
    leaves.castShadow = true;
    group.add(leaves);
    
    const leaves2Geo = new THREE.ConeGeometry(2.5, 5, 8);
    const leaves2 = new THREE.Mesh(leaves2Geo, leavesMat);
    leaves2.position.y = 10;
    leaves2.castShadow = true;
    group.add(leaves2);
    
    return group;
}

function createBench() {
    const group = new THREE.Group();
    const woodColor = 0x8B4513;
    const metalColor = 0x333333;
    
    const seatGeo = new THREE.BoxGeometry(3, 0.2, 1);
    const seatMat = new THREE.MeshLambertMaterial({ color: woodColor });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.y = 0.8;
    seat.castShadow = true;
    group.add(seat);
    
    const backGeo = new THREE.BoxGeometry(3, 1, 0.15);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(0, 1.4, -0.4);
    back.rotation.x = 0.1;
    back.castShadow = true;
    group.add(back);
    
    const legMat = new THREE.MeshLambertMaterial({ color: metalColor });
    for (let x = -1; x <= 1; x += 2) {
        const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.8);
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x * 1.2, 0.4, 0);
        leg.castShadow = true;
        group.add(leg);
    }
    
    return group;
}

function addWindowsToBlock(group, width, height, depth, buildingColor) {
    const windowMat = new THREE.MeshBasicMaterial({
        color: 0xffffcc,
        transparent: true,
        opacity: 0.8
    });
    
    const darkWindowMat = new THREE.MeshBasicMaterial({
        color: 0x87CEEB,
        transparent: true,
        opacity: 0.4
    });
    
    const windowWidth = 2;
    const windowHeight = 3;
    const spacingX = 5;
    const spacingY = 6;
    
    const windowsX = Math.floor(width / spacingX) - 1;
    const windowsY = Math.floor(height / spacingY) - 1;
    
    for (let i = 0; i < windowsX; i++) {
        for (let j = 0; j < windowsY; j++) {
            const isLit = Math.random() > 0.3;
            const mat = isLit ? windowMat : darkWindowMat;
            
            const windowGeo = new THREE.PlaneGeometry(windowWidth, windowHeight);
            
            const windowFront = new THREE.Mesh(windowGeo, mat);
            windowFront.position.set(
                -width / 2 + spacingX + i * spacingX,
                spacingY + j * spacingY,
                depth / 2 + 0.1
            );
            group.add(windowFront);
            
            const windowBack = new THREE.Mesh(windowGeo, mat);
            windowBack.position.set(
                -width / 2 + spacingX + i * spacingX,
                spacingY + j * spacingY,
                -depth / 2 - 0.1
            );
            windowBack.rotation.y = Math.PI;
            group.add(windowBack);
        }
    }
    
    const windowsZ = Math.floor(depth / spacingX) - 1;
    for (let i = 0; i < windowsZ; i++) {
        for (let j = 0; j < windowsY; j++) {
            const isLit = Math.random() > 0.3;
            const mat = isLit ? windowMat : darkWindowMat;
            
            const windowGeo = new THREE.PlaneGeometry(windowWidth, windowHeight);
            
            const windowRight = new THREE.Mesh(windowGeo, mat);
            windowRight.position.set(
                width / 2 + 0.1,
                spacingY + j * spacingY,
                -depth / 2 + spacingX + i * spacingX
            );
            windowRight.rotation.y = Math.PI / 2;
            group.add(windowRight);
            
            const windowLeft = new THREE.Mesh(windowGeo, mat);
            windowLeft.position.set(
                -width / 2 - 0.1,
                spacingY + j * spacingY,
                -depth / 2 + spacingX + i * spacingX
            );
            windowLeft.rotation.y = -Math.PI / 2;
            group.add(windowLeft);
        }
    }
}

function createRoads(cityGroup, freeSpace, cellWidth, cellDepth, scale) {
    const rows = freeSpace.rows;
    const cols = freeSpace.cols;
    const lastRow = rows[rows.length - 1];
    const lastCol = cols[cols.length - 1];
    
    const roadMat = new THREE.MeshLambertMaterial({ color: CITY_CONFIG.ROAD_COLOR });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: CITY_CONFIG.SIDEWALK_COLOR });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    
    for (let i = 0; i < cols.length; i++) {
        const roadLength = cellDepth * (lastRow + 1) * scale;
        const roadWidth = cellWidth * scale;
        
        const roadGeo = new THREE.BoxGeometry(roadWidth, 0.3, roadLength);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(
            cols[i] * cellWidth * scale + roadWidth / 2,
            0,
            roadLength / 2
        );
        road.receiveShadow = true;
        cityGroup.add(road);
        roadMeshes.push(road);
        groundMeshes.push(road);
        
        const centerLineGeo = new THREE.BoxGeometry(0.3, 0.05, roadLength);
        const centerLine = new THREE.Mesh(centerLineGeo, yellowLineMat);
        centerLine.position.set(
            cols[i] * cellWidth * scale + roadWidth / 2,
            0.2,
            roadLength / 2
        );
        cityGroup.add(centerLine);
        
        for (let side = -1; side <= 1; side += 2) {
            const edgeLineGeo = new THREE.BoxGeometry(0.2, 0.05, roadLength);
            const edgeLine = new THREE.Mesh(edgeLineGeo, lineMat);
            edgeLine.position.set(
                cols[i] * cellWidth * scale + roadWidth / 2 + side * (roadWidth / 2 - 1),
                0.2,
                roadLength / 2
            );
            cityGroup.add(edgeLine);
        }
        
        const sidewalkWidth = 3;
        for (let side = -1; side <= 1; side += 2) {
            const sidewalkGeo = new THREE.BoxGeometry(sidewalkWidth, 0.5, roadLength);
            const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
            sidewalk.position.set(
                cols[i] * cellWidth * scale + roadWidth / 2 + side * (roadWidth / 2 + sidewalkWidth / 2),
                0.1,
                roadLength / 2
            );
            sidewalk.receiveShadow = true;
            cityGroup.add(sidewalk);
            groundMeshes.push(sidewalk);
        }
    }
    
    for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < cols.length - 1; j++) {
            const segmentCells = cols[j + 1] - cols[j] - 1;
            if (segmentCells <= 0) continue;
            
            const boxWidth = cellWidth * segmentCells * scale;
            const roadHeight = cellDepth * scale;
            
            const roadGeo = new THREE.BoxGeometry(boxWidth, 0.3, roadHeight);
            const road = new THREE.Mesh(roadGeo, roadMat);
            road.position.set(
                boxWidth / 2 + cellWidth * (cols[j] + 1) * scale,
                0,
                rows[i] * cellDepth * scale + roadHeight / 2
            );
            road.receiveShadow = true;
            cityGroup.add(road);
            roadMeshes.push(road);
            groundMeshes.push(road);
            
            const centerLineGeo = new THREE.BoxGeometry(boxWidth, 0.05, 0.3);
            const centerLine = new THREE.Mesh(centerLineGeo, yellowLineMat);
            centerLine.position.set(
                boxWidth / 2 + cellWidth * (cols[j] + 1) * scale,
                0.2,
                rows[i] * cellDepth * scale + roadHeight / 2
            );
            cityGroup.add(centerLine);
        }
    }
    
    for (let i = 0; i < cols.length; i++) {
        for (let j = 0; j < rows.length; j++) {
            const intersectionX = cols[i] * cellWidth * scale + cellWidth * scale / 2;
            const intersectionZ = rows[j] * cellDepth * scale + cellDepth * scale / 2;
            
            const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            
            for (let k = 0; k < 5; k++) {
                const stripeGeo = new THREE.BoxGeometry(cellWidth * scale * 0.8, 0.06, 1);
                const stripe = new THREE.Mesh(stripeGeo, crosswalkMat);
                stripe.position.set(
                    intersectionX,
                    0.18,
                    intersectionZ - cellDepth * scale * 0.3 + k * 2
                );
                cityGroup.add(stripe);
            }
        }
    }
}

function createLampParticles(cityGroup) {
    const poleHeight = 35;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    const lightMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffcc,
        transparent: true,
        opacity: 0.95
    });
    
    const polePositions = [];
    
    lamps.forEach((lampData, index) => {
        if (index % 2 !== 0) return;
        
        const corners = [
            { x: 1, z: 1 },
            { x: 1, z: -1 },
            { x: -1, z: 1 },
            { x: -1, z: -1 }
        ];
        
        const corner = corners[index % 4];
        const offsetX = corner.x * (lampData.width * CITY_CONFIG.T3_SCALE / 2 + 8);
        const offsetZ = corner.z * (lampData.depth * CITY_CONFIG.T3_SCALE / 2 + 8);
        
        const poleX = lampData.position.x + offsetX;
        const poleZ = lampData.position.z + offsetZ;
        
        const poleGeo = new THREE.CylinderGeometry(0.4, 0.6, poleHeight, 8);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(poleX, poleHeight / 2, poleZ);
        pole.castShadow = true;
        cityGroup.add(pole);
        
        const armGeo = new THREE.BoxGeometry(12, 0.4, 0.4);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(poleX, poleHeight - 2, poleZ);
        cityGroup.add(arm);
        
        for (let side = -1; side <= 1; side += 2) {
            const insulatorGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6);
            const insulatorMat = new THREE.MeshLambertMaterial({ color: 0x3a5a3a });
            const insulator = new THREE.Mesh(insulatorGeo, insulatorMat);
            insulator.position.set(poleX + side * 5, poleHeight - 1, poleZ);
            cityGroup.add(insulator);
        }
        
        const lightArmGeo = new THREE.BoxGeometry(0.3, 0.3, 6);
        const lightArm = new THREE.Mesh(lightArmGeo, poleMat);
        lightArm.position.set(poleX, poleHeight - 5, poleZ + 3);
        cityGroup.add(lightArm);
        
        const lightHousingGeo = new THREE.BoxGeometry(1.5, 0.8, 2.5);
        const lightHousingMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
        const lightHousing = new THREE.Mesh(lightHousingGeo, lightHousingMat);
        lightHousing.position.set(poleX, poleHeight - 5.5, poleZ + 5.5);
        cityGroup.add(lightHousing);
        const lightGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(poleX, poleHeight - 6, poleZ + 5.5);
        cityGroup.add(light);
        
        polePositions.push({ x: poleX, z: poleZ, height: poleHeight });
    });
    
    createPowerLines(cityGroup, polePositions);
}

function createPowerLines(cityGroup, polePositions) {
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, linewidth: 1 });
    
    for (let i = 0; i < polePositions.length - 1; i++) {
        const pole1 = polePositions[i];
        const pole2 = polePositions[i + 1];
        
        const distance = Math.sqrt(
            Math.pow(pole2.x - pole1.x, 2) + 
            Math.pow(pole2.z - pole1.z, 2)
        );
        
        if (distance > 200) continue;
        
        for (let wireOffset = -5; wireOffset <= 5; wireOffset += 10) {
            const points = [];
            const segments = 20;
            
            for (let j = 0; j <= segments; j++) {
                const t = j / segments;
                const x = pole1.x + (pole2.x - pole1.x) * t;
                const z = pole1.z + (pole2.z - pole1.z) * t;
                
                const sag = Math.sin(t * Math.PI) * (distance * 0.02);
                const y = pole1.height - 2 - sag;
                
                points.push(new THREE.Vector3(x, y, z));
            }
            
            const wireGeo = new THREE.BufferGeometry().setFromPoints(points);
            const wire = new THREE.Line(wireGeo, wireMat);
            cityGroup.add(wire);
        }
    }
}

async function loadAllModels() {
    const loader = new THREE.GLTFLoader();
    const loadingProgress = document.getElementById('loading-progress');
    const loadingText = document.getElementById('loading-text');
    
    let loaded = 0;
    const total = 2;
    
    const updateProgress = (text) => {
        loaded++;
        const percent = (loaded / total) * 100;
        if (loadingProgress) loadingProgress.style.width = percent + '%';
        if (loadingText) loadingText.textContent = text + ` (${Math.round(percent)}%)`;
    };
    
    if (loadingText) loadingText.textContent = 'Generating World.js style city...';
    createWorldJSCity();
    updateProgress('City generated');
    
    if (loadingText) loadingText.textContent = 'Loading taxi...';
    
    try {
        const taxiGLTF = await new Promise((resolve, reject) => {
            loader.load('assets/taxi.glb', resolve,
                (xhr) => console.log(`Taxi: ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`),
                reject
            );
        });
        
        taxiModel = taxiGLTF.scene;
        taxiModel.position.set(0, PHYSICS.GROUND_HEIGHT, 0);
        taxiModel.scale.set(SCALES.TAXI, SCALES.TAXI, SCALES.TAXI);
        
        taxiModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        scene.add(taxiModel);
        console.log('✅ Taxi loaded');
        
    } catch (error) {
        console.warn('⚠️ taxi.glb not found, using fallback');
        createFallbackTaxi();
    }
    updateProgress('Taxi loaded');
    
    positionTaxiOnRoadAtStart();
    createPassengersOnRoadsOnly();
    createSimpleTrafficLights();
}

function createPassengersOnRoadsOnly() {
    const passengerNames = [
        'John', 'Emma', 'Michael', 'Sarah', 'David',
        'Lisa', 'James', 'Anna', 'Robert', 'Maria',
        'Tom', 'Sophie', 'Chris', 'Laura', 'Kevin'
    ];
    
    let validRoadPoints = [];
    
    if (roadMeshes.length > 0) {
        for (let i = 0; i < roadMeshes.length; i++) {
            const road = roadMeshes[i];
            const roadBox = new THREE.Box3().setFromObject(road);
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            roadBox.getCenter(center);
            roadBox.getSize(size);
            
            if (Math.max(size.x, size.z) < 50) continue;
            
            if (center.x >= MAP_BOUNDS.minX + 150 && center.x <= MAP_BOUNDS.maxX - 150 &&
                center.z >= MAP_BOUNDS.minZ + 150 && center.z <= MAP_BOUNDS.maxZ - 150) {
                
                const sidewalkOffset = 15;
                
                    for (let j = 0; j < 3; j++) {
                    const offset = (j - 1) * 30;
                    
                    if (size.x > size.z) {
                        validRoadPoints.push({ 
                            x: center.x + offset, 
                            z: center.z + sidewalkOffset
                        });
                        validRoadPoints.push({ 
                            x: center.x + offset, 
                            z: center.z - sidewalkOffset
                        });
                    } else {
                        validRoadPoints.push({ 
                            x: center.x + sidewalkOffset, 
                            z: center.z + offset
                        });
                        validRoadPoints.push({ 
                            x: center.x - sidewalkOffset, 
                            z: center.z + offset
                        });
                    }
                }
            }
        }
    }
    
    validRoadPoints = validRoadPoints.filter(point => {
        const testPos = new THREE.Vector3(point.x, 5, point.z);
        for (let box of buildingCollisionBoxes) {
            if (box.containsPoint(testPos)) return false;
            const expanded = box.clone().expandByScalar(10);
            if (expanded.containsPoint(testPos)) return false;
        }
        return true;
    });
    
    const filteredPoints = [];
    for (let point of validRoadPoints) {
        let tooClose = false;
        for (let existing of filteredPoints) {
            const dist = Math.sqrt(Math.pow(point.x - existing.x, 2) + Math.pow(point.z - existing.z, 2));
            if (dist < 80) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) filteredPoints.push(point);
    }
    
    const selectedPoints = [];
    const numPassengers = Math.min(12, filteredPoints.length);
    
    for (let i = 0; i < numPassengers; i++) {
        if (filteredPoints.length === 0) break;
        const randomIndex = Math.floor(Math.random() * filteredPoints.length);
        selectedPoints.push(filteredPoints[randomIndex]);
        filteredPoints.splice(randomIndex, 1);
    }
    
    selectedPoints.forEach((spawnPoint, index) => {
        let bestDropoff = null;
        let maxDist = 0;
        for (let i = 0; i < selectedPoints.length; i++) {
            if (i === index) continue;
            const dist = Math.sqrt(
                Math.pow(selectedPoints[i].x - spawnPoint.x, 2) + 
                Math.pow(selectedPoints[i].z - spawnPoint.z, 2)
            );
            if (dist > maxDist) {
                maxDist = dist;
                bestDropoff = selectedPoints[i];
            }
        }
        const dropoff = bestDropoff || selectedPoints[(index + 1) % selectedPoints.length];
        
        const typeKeys = Object.keys(PASSENGER_TYPES);
        const randomType = typeKeys[Math.floor(Math.random() * typeKeys.length)];
        const passengerType = PASSENGER_TYPES[randomType];
        
        const passengerData = {
            id: index,
            name: passengerNames[index % passengerNames.length],
            type: randomType,
            baseFare: 25 + Math.floor(Math.random() * 15),
            pickup: { x: spawnPoint.x, z: spawnPoint.z },
            dropoff: { x: dropoff.x, z: dropoff.z },
            marker: null,
            dropoffMarker: null,
            pickupTime: null
        };
        
        const passengerMesh = createPassengerMesh(passengerType.color);
        passengerMesh.position.set(spawnPoint.x, 0, spawnPoint.z);
        passengerMesh.scale.set(SCALES.PASSENGER * 5, SCALES.PASSENGER * 5, SCALES.PASSENGER * 5);
        
        passengerMesh.userData.floatOffset = Math.random() * Math.PI * 2;
        passengerMesh.userData.animate = function() {
            const time = Date.now() * 0.002 + this.userData.floatOffset;
            this.position.y = Math.sin(time) * 0.5 + 2;
            this.rotation.y += 0.015;
        }.bind(passengerMesh);
        
        scene.add(passengerMesh);
        passengerData.marker = passengerMesh;
        passengers.push(passengerData);
    });
    
}

function createPassengerMesh(color) {
    const group = new THREE.Group();
    
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);
    
    const headGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xFFD7A8 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.8;
    head.castShadow = true;
    group.add(head);
    
    const ringGeo = new THREE.RingGeometry(0.6, 0.8, 16);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);
    
    return group;
}

function createSimpleTrafficLights() {
    console.log('🚦 Creating traffic lights at intersections...');
    
    let lightCount = 0;
    
    for (let i = 0; i < gridCols.length; i++) {
        for (let j = 0; j < gridRows.length; j++) {
            const x = gridCols[i] * CITY_CONFIG.CELL_WIDTH * CITY_CONFIG.T3_SCALE + 
                      CITY_CONFIG.CELL_WIDTH * CITY_CONFIG.T3_SCALE / 2;
            const z = gridRows[j] * CITY_CONFIG.CELL_DEPTH * CITY_CONFIG.T3_SCALE + 
                      CITY_CONFIG.CELL_DEPTH * CITY_CONFIG.T3_SCALE / 2;
            
            createSimpleTrafficLight(x, z);
            lightCount++;
        }
    }
    
}

function createSimpleTrafficLight(x, z) {
    const offset = CITY_CONFIG.CELL_WIDTH * CITY_CONFIG.T3_SCALE / 2 + 2;
    
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 42, 8),
        new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    pole.position.set(x + offset, 21, z + offset);
    pole.castShadow = true;
    scene.add(pole);
    
    const lightBox = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 17.5, 5.6),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    lightBox.position.set(x + offset, 49, z + offset);
    lightBox.castShadow = true;
    scene.add(lightBox);
    
    const redLight = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x330000 })
    );
    redLight.position.set(x + offset, 54, z + offset + 3);
    scene.add(redLight);
    
    const yellowLight = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x333300 })
    );
    yellowLight.position.set(x + offset, 49, z + offset + 3);
    scene.add(yellowLight);
    
    const greenLight = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    greenLight.position.set(x + offset, 44, z + offset + 3);
    scene.add(greenLight);
    
    trafficLights.push({
        position: new THREE.Vector3(x, 0, z),
        red: redLight,
        yellow: yellowLight,
        green: greenLight,
        state: 'green',
        timer: Math.random() * 15,
        greenTime: 15,
        yellowTime: 3,
        redTime: 12
    });
}

function createFallbackTaxi() {
    const group = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(2, 1, 4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.8, 2);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 1.7, -0.3);
    cabin.castShadow = true;
    group.add(cabin);
    
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    
    const wheelPositions = [
        { x: -1, z: 1.2 },
        { x: 1, z: 1.2 },
        { x: -1, z: -1.2 },
        { x: 1, z: -1.2 }
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, 0.4, pos.z);
        wheel.castShadow = true;
        group.add(wheel);
    });
    
    taxiModel = group;
    taxiModel.position.set(0, PHYSICS.GROUND_HEIGHT, 0);
    taxiModel.scale.set(SCALES.TAXI, SCALES.TAXI, SCALES.TAXI);
    scene.add(taxiModel);
}

function positionTaxiOnRoadAtStart() {
    if (!taxiModel || roadMeshes.length === 0) {
        console.warn('⚠️ No roads found');
        return;
    }

    let bestSpawn = null;
    let bestScore = -Infinity;

    for (let i = 0; i < roadMeshes.length; i++) {
        const road = roadMeshes[i];
        const box = new THREE.Box3().setFromObject(road);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const roadSize = Math.max(size.x, size.z);
        if (roadSize < 100) continue;

        const spawnPos = new THREE.Vector3(
            center.x,
            PHYSICS.GROUND_HEIGHT,
            center.z
        );

        let intersectsBuilding = false;
        for (let j = 0; j < buildingCollisionBoxes.length; j++) {
            const testBox = new THREE.Box3().setFromCenterAndSize(
                spawnPos,
                new THREE.Vector3(20, 20, 20)
            );
            if (testBox.intersectsBox(buildingCollisionBoxes[j])) {
                intersectsBuilding = true;
                break;
            }
        }
        if (intersectsBuilding) continue;

        let minPassengerDist = Infinity;
        for (let p of passengers) {
            const dist = Math.sqrt(
                Math.pow(spawnPos.x - p.pickup.x, 2) + 
                Math.pow(spawnPos.z - p.pickup.z, 2)
            );
            minPassengerDist = Math.min(minPassengerDist, dist);
        }

        const centralityBonus = 100 - (
            Math.abs(center.x - (MAP_BOUNDS.maxX + MAP_BOUNDS.minX) / 2) * 0.05 + 
            Math.abs(center.z - (MAP_BOUNDS.maxZ + MAP_BOUNDS.minZ) / 2) * 0.05
        );
        
        const score = roadSize + centralityBonus + (minPassengerDist * 0.5);

        if (score > bestScore) {
            bestScore = score;
            bestSpawn = spawnPos;
        }
    }

    if (bestSpawn) {
        taxiModel.position.copy(bestSpawn);
    } else {
        const centerX = (MAP_BOUNDS.maxX + MAP_BOUNDS.minX) / 2;
        const centerZ = (MAP_BOUNDS.maxZ + MAP_BOUNDS.minZ) / 2;
        taxiModel.position.set(centerX, PHYSICS.GROUND_HEIGHT, centerZ);
    }

    updateGroundCollision();
    velocity.set(0, 0, 0);
    rotation = 0;
    isOnRoad = true;

}

function updateGroundCollision() {
    if (!taxiModel || groundMeshes.length === 0) return;
    
    const raycaster = new THREE.Raycaster(
        taxiModel.position.clone().add(new THREE.Vector3(0, 10, 0)),
        new THREE.Vector3(0, -1, 0),
        0,
        30
    );
    
    const intersects = raycaster.intersectObjects(groundMeshes, true);
    
    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        taxiModel.position.y = groundY + PHYSICS.GROUND_HEIGHT;
        
        const roadCheck = raycaster.intersectObjects(roadMeshes, true);
        isOnRoad = (roadCheck.length > 0 && roadCheck[0].distance < 12);
    } else {
        taxiModel.position.y = Math.max(taxiModel.position.y, PHYSICS.GROUND_HEIGHT);
        isOnRoad = false;
    }
}

function checkBuildingCollision(moveDirection) {
    if (!taxiModel || buildingCollisionBoxes.length === 0) return false;
    if (moveDirection.length() < 0.0001) return false;
    
    const currentBox = new THREE.Box3().setFromObject(taxiModel);
    currentBox.expandByScalar(0.8);
    
    const nextBox = currentBox.clone();
    nextBox.min.add(moveDirection);
    nextBox.max.add(moveDirection);
    
    for (let i = 0; i < buildingCollisionBoxes.length; i++) {
        if (nextBox.intersectsBox(buildingCollisionBoxes[i])) {
            velocity.z = 0;
            velocity.x = 0;
            
            const backOff = moveDirection.clone().setLength(0.5).negate();
            taxiModel.position.add(backOff);
            
            return true;
        }
    }
    
    return false;
}

function enforceMapBoundaries() {
    if (!taxiModel) return false;
    
    let hitBoundary = false;
    const buffer = 15;
    
    if (taxiModel.position.x < MAP_BOUNDS.minX + buffer) {
        taxiModel.position.x = MAP_BOUNDS.minX + buffer;
        velocity.x = 0;
        velocity.z = 0;
        hitBoundary = true;
    } else if (taxiModel.position.x > MAP_BOUNDS.maxX - buffer) {
        taxiModel.position.x = MAP_BOUNDS.maxX - buffer;
        velocity.x = 0;
        velocity.z = 0;
        hitBoundary = true;
    }
    
    if (taxiModel.position.z < MAP_BOUNDS.minZ + buffer) {
        taxiModel.position.z = MAP_BOUNDS.minZ + buffer;
        velocity.z = 0;
        hitBoundary = true;
    } else if (taxiModel.position.z > MAP_BOUNDS.maxZ - buffer) {
        taxiModel.position.z = MAP_BOUNDS.maxZ - buffer;
        velocity.z = 0;
        hitBoundary = true;
    }
    
    return hitBoundary;
}

// ============================================================================
// CONTROLS
// ============================================================================
function setupControls() {
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() === 'r') togglePassengerList();
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setupMinimapToggle() {
    const minimapContainer = document.getElementById('minimap-container');
    const minimapToggle = document.getElementById('minimap-toggle');
    const minimapClose = document.getElementById('minimap-close');
    const minimap = document.getElementById('minimap');
    
    if (minimapToggle) {
        minimapToggle.addEventListener('click', () => {
            if (minimapContainer) minimapContainer.classList.add('fullscreen');
            minimapToggle.classList.add('hidden');
            if (minimapClose) minimapClose.classList.remove('hidden');
        });
    }
    
    if (minimapClose) {
        minimapClose.addEventListener('click', () => {
            if (minimapContainer) minimapContainer.classList.remove('fullscreen');
            if (minimapToggle) minimapToggle.classList.remove('hidden');
            minimapClose.classList.add('hidden');
        });
    }
    
    if (minimap) {
        minimap.addEventListener('click', () => {
            if (minimapContainer && !minimapContainer.classList.contains('fullscreen')) {
                minimapContainer.classList.add('fullscreen');
                if (minimapToggle) minimapToggle.classList.add('hidden');
                if (minimapClose) minimapClose.classList.remove('hidden');
            }
        });
    }
}

// ============================================================================
// ANIMATION
// ============================================================================
let frameCount = 0;

function animate() {
    requestAnimationFrame(animate);
    frameCount++;
    
    if (!taxiModel) return;
    
    let input = 0;
    if (keys['w'] || keys['arrowup']) input = 1;
    if (keys['s'] || keys['arrowdown']) input = -1;
    
    if (input !== 0) {
        velocity.z += input * PHYSICS.ACCELERATION;
    } else {
        velocity.z *= PHYSICS.FRICTION;
        if (Math.abs(velocity.z) < 0.0005) velocity.z = 0;
    }
    
    const maxForward = PHYSICS.MAX_SPEED;
    const maxReverse = PHYSICS.MAX_SPEED * PHYSICS.REVERSE_SPEED;
    if (velocity.z > maxForward) velocity.z = maxForward;
    if (velocity.z < -maxReverse) velocity.z = -maxReverse;
    
    if (keys[' ']) {
        velocity.z *= 0.85;
    }
    
    if (Math.abs(velocity.z) > 0.015) {
        if (keys['a'] || keys['arrowleft']) {
            rotation += PHYSICS.TURN_SPEED * Math.sign(velocity.z);
        }
        if (keys['d'] || keys['arrowright']) {
            rotation -= PHYSICS.TURN_SPEED * Math.sign(velocity.z);
        }
    }
    
    taxiModel.rotation.y = rotation;
    
    const moveDirection = new THREE.Vector3(0, 0, velocity.z)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    
    const willCollide = checkBuildingCollision(moveDirection);
    
    if (!willCollide) {
        taxiModel.position.add(moveDirection);
    }
    
    updateGroundCollision();
    enforceMapBoundaries();
    updateThirdPersonCamera();
    updateTrafficLights();
    updateGameTime();
    checkPassengerPickup();
    checkPassengerDropoff();
    updateDestinationArrow();
    
    passengers.forEach(p => {
        if (p.marker && p.marker.userData.animate) {
            p.marker.userData.animate();
        }
    });
    
    if (frameCount % 3 === 0) updateMinimap();
    
    const displaySpeed = Math.abs(velocity.z) * 180;
    const speedElement = document.getElementById('speed');
    if (speedElement) speedElement.textContent = Math.round(displaySpeed);
    
    renderer.render(scene, camera);
}

function updateThirdPersonCamera() {
    if (!taxiModel) return;
    
    const offset = new THREE.Vector3(
        0,
        CAMERA_CONFIG.HEIGHT,
        -CAMERA_CONFIG.DISTANCE
    );
    
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    
    const targetCameraPos = new THREE.Vector3(
        taxiModel.position.x + offset.x,
        taxiModel.position.y + offset.y,
        taxiModel.position.z + offset.z
    );
    
    camera.position.lerp(targetCameraPos, CAMERA_CONFIG.LERP_SPEED);
    
    const lookAtPoint = new THREE.Vector3(
        taxiModel.position.x,
        taxiModel.position.y + CAMERA_CONFIG.LOOK_AT_HEIGHT,
        taxiModel.position.z
    );
    
    camera.lookAt(lookAtPoint);
}


let lastViolationTime = 0;

function updateTrafficLights() {
    trafficLights.forEach(light => {
        light.timer += 0.016;
        
        const totalCycle = light.greenTime + light.yellowTime + light.redTime;
        const cyclePosition = light.timer % totalCycle;
        
        if (cyclePosition < light.greenTime) {
            light.state = 'green';
            light.red.material.color.setHex(0x330000);
            light.yellow.material.color.setHex(0x333300);
            light.green.material.color.setHex(0x00ff00);
        } else if (cyclePosition < light.greenTime + light.yellowTime) {
            light.state = 'yellow';
            light.red.material.color.setHex(0x330000);
            light.yellow.material.color.setHex(0xffff00);
            light.green.material.color.setHex(0x003300);
        } else {
            light.state = 'red';
            light.red.material.color.setHex(0xff0000);
            light.yellow.material.color.setHex(0x333300);
            light.green.material.color.setHex(0x003300);
        }
        
        const now = Date.now();
        if (light.state === 'red' &&
            taxiModel &&
            isOnRoad &&
            taxiModel.position.distanceTo(light.position) < 25 &&
            Math.abs(velocity.z) > 0.05 &&
            now - lastViolationTime > 2000) {
            
            money -= 15;
            const moneyElement = document.getElementById('money');
            if (moneyElement) moneyElement.textContent = money;
            showNotification('🚨 RED LIGHT VIOLATION! -$15', 2500);
            lastViolationTime = now;
        }
    });
}

function updateGameTime() {
    gameTime += 0.0001;
    if (gameTime >= 24) gameTime = 0;
    
    const hours = Math.floor(gameTime);
    const minutes = Math.floor((gameTime - hours) * 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    const timeElement = document.getElementById('game-time');
    if (timeElement) {
        timeElement.textContent = `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }
    
    let period = 'Morning';
    if (hours >= 12 && hours < 17) period = 'Afternoon';
    else if (hours >= 17 && hours < 20) period = 'Evening';
    else if (hours >= 20 || hours < 6) period = 'Night';
    
    const periodElement = document.getElementById('day-period');
    if (periodElement) periodElement.textContent = period;
    
    let skyColor;
    if (hours >= 5 && hours < 7) skyColor = 0xffa07a;
    else if (hours >= 7 && hours < 17) skyColor = 0x87CEEB;
    else if (hours >= 17 && hours < 19) skyColor = 0xff6347;
    else if (hours >= 19 && hours < 21) skyColor = 0x4a5f7f;
    else skyColor = 0x0a1929;
    
    if (scene.background) scene.background.lerp(new THREE.Color(skyColor), 0.005);
    if (scene.fog) scene.fog.color.lerp(new THREE.Color(skyColor), 0.005);
}

// ============================================================================
// MINIMAP
// ============================================================================
function updateMinimap() {
    const canvas = document.getElementById('minimap');
    if (!canvas || !taxiModel) return;
    
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('minimap-container');
    const isFullscreen = container && container.classList.contains('fullscreen');
    
    const width = isFullscreen ? (container.clientWidth || 400) : 200;
    const height = isFullscreen ? (container.clientHeight || 400) : 200;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    const gridSize = width / 6;
    for (let i = 0; i <= width; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }
    
    const worldWidth = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
    const worldHeight = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;
    const scale = Math.min(width / worldWidth, height / worldHeight) * 0.88;
    
    const centerX = width / 2;
    const centerY = height / 2;
    
    const worldToMinimap = (wx, wz) => {
        const relX = (wx - (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2);
        const relZ = (wz - (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) / 2);
        return {
            x: centerX + (relX * scale),
            y: centerY + (relZ * scale)
        };
    };
    
    passengers.forEach(p => {
        if (p === currentPassenger) return;
        
        const pos = worldToMinimap(p.pickup.x, p.pickup.z);
        
        ctx.fillStyle = '#00ff00';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });
    
    if (destinationMarker) {
        const pos = worldToMinimap(destinationMarker.position.x, destinationMarker.position.z);
        
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    const taxiPos = worldToMinimap(taxiModel.position.x, taxiModel.position.z);
    
    ctx.save();
    ctx.translate(taxiPos.x, taxiPos.y);
    ctx.rotate(rotation + Math.PI);
    
    ctx.fillStyle = isOnRoad ? '#00ff00' : '#ff3333';
    ctx.shadowColor = isOnRoad ? '#00ff00' : '#ff3333';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.restore();
}

// ============================================================================
// DESTINATION
// ============================================================================
function updateDestinationArrow() {
    if (!currentPassenger || !destinationMarker || !taxiModel) return;
    
    const target = gameState === 'going_to_pickup'
        ? currentPassenger.pickup
        : currentPassenger.dropoff;
    
    const dx = target.x - taxiModel.position.x;
    const dz = target.z - taxiModel.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (!destinationArrow) {
        const arrowGeo = new THREE.ConeGeometry(2, 5, 3);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        destinationArrow = new THREE.Mesh(arrowGeo, arrowMat);
        destinationArrow.rotation.x = Math.PI;
        scene.add(destinationArrow);
    }
    
    destinationArrow.position.set(target.x, 20, target.z);
    
    const distElement = document.getElementById('destination-distance');
    if (distElement) {
        distElement.textContent = `${Math.round(distance)}m`;
    }
}
function checkPassengerPickup() {
    if (gameState !== 'going_to_pickup' || !currentPassenger || !taxiModel) return;
    
    const pickupPos = new THREE.Vector3(currentPassenger.pickup.x, 0, currentPassenger.pickup.z);
    const dist = taxiModel.position.distanceTo(pickupPos);
    
    if (dist < 15 && Math.abs(velocity.z) < 0.05) {
        gameState = 'going_to_dropoff';
        currentPassenger.pickupTime = Date.now();
        
        if (currentPassenger.marker) {
            currentPassenger.marker.visible = false;
        }
        
        if (currentPassenger.pickupRing) {
            scene.remove(currentPassenger.pickupRing);
            currentPassenger.pickupRing = null;
        }
        
        if (currentPassenger.pickupBeacon) {
            scene.remove(currentPassenger.pickupBeacon);
            currentPassenger.pickupBeacon = null;
        }
        
        if (destinationMarker) {
            scene.remove(destinationMarker);
            destinationMarker = null;
        }
        
        const dropoffGeo = new THREE.CylinderGeometry(5, 5, 2, 16);
        const dropoffMat = new THREE.MeshBasicMaterial({ 
            color: 0xff4444,
            transparent: true,
            opacity: 0.8
        });
        destinationMarker = new THREE.Mesh(dropoffGeo, dropoffMat);
        destinationMarker.position.set(
            currentPassenger.dropoff.x,
            1,
            currentPassenger.dropoff.z
        );
        scene.add(destinationMarker);
        
        const ringGeo = new THREE.RingGeometry(8, 12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
        });
        const dropoffRing = new THREE.Mesh(ringGeo, ringMat);
        dropoffRing.rotation.x = -Math.PI / 2;
        dropoffRing.position.set(
            currentPassenger.dropoff.x,
            0.5,
            currentPassenger.dropoff.z
        );
        scene.add(dropoffRing);
        currentPassenger.dropoffRing = dropoffRing;
        
        const beaconGeo = new THREE.CylinderGeometry(0.5, 0.5, 50, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.3
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(
            currentPassenger.dropoff.x,
            25,
            currentPassenger.dropoff.z
        );
        scene.add(beacon);
        currentPassenger.dropoffBeacon = beacon;
        
        const gameStateEl = document.getElementById('game-state');
        if (gameStateEl) {
            gameStateEl.textContent = 'DROP OFF';
            gameStateEl.className = 'dropoff';
        }
        
        const typeName = PASSENGER_TYPES[currentPassenger.type].name;
        showNotification(`✅ ${currentPassenger.name} (${typeName}) picked up! Go to RED marker!`, 3000);
    }
}

function checkPassengerDropoff() {
    if (gameState !== 'going_to_dropoff' || !currentPassenger || !taxiModel) return;
    
    const dropoffPos = new THREE.Vector3(currentPassenger.dropoff.x, 0, currentPassenger.dropoff.z);
    const dist = taxiModel.position.distanceTo(dropoffPos);
    
    if (dist < 15 && Math.abs(velocity.z) < 0.05) {
        const fareResult = calculateFareWithTip();
        money += fareResult.total;
        
        const moneyElement = document.getElementById('money');
        if (moneyElement) moneyElement.textContent = money;
        
        if (destinationMarker) {
            scene.remove(destinationMarker);
            destinationMarker = null;
        }
        
        if (destinationArrow) {
            scene.remove(destinationArrow);
            destinationArrow = null;
        }
        
        if (currentPassenger.marker) {
            scene.remove(currentPassenger.marker);
        }
        
        if (currentPassenger.dropoffRing) {
            scene.remove(currentPassenger.dropoffRing);
        }
        
        if (currentPassenger.dropoffBeacon) {
            scene.remove(currentPassenger.dropoffBeacon);
        }
        
        passengers = passengers.filter(p => p.id !== currentPassenger.id);
        
        const passengerName = currentPassenger.name;
        const passengerType = PASSENGER_TYPES[currentPassenger.type].name;
        
        currentPassenger = null;
        
        const gameStateEl = document.getElementById('game-state');
        if (gameStateEl) {
            gameStateEl.textContent = 'FREE ROAM';
            gameStateEl.className = '';
        }
        
        const passengerInfo = document.getElementById('passenger-info');
        if (passengerInfo) passengerInfo.classList.remove('active');
        
        let speedRating = 'Slow';
        if (fareResult.speedBonus >= 25) speedRating = ' FAST!';
        else if (fareResult.speedBonus >= 15) speedRating = ' Quick';
        
        showNotification(
            `💰 ${passengerName} dropped off! Base: $${fareResult.base} | Tip: $${fareResult.tip} (${speedRating}) | TOTAL: $${fareResult.total}`,
            4000
        );
    }
}

function calculateFareWithTip() {
    const pickup = currentPassenger.pickup;
    const dropoff = currentPassenger.dropoff;
    
    const dx = dropoff.x - pickup.x;
    const dz = dropoff.z - pickup.z;
    const distance = Math.sqrt(dx * dx + dz * dz) / 10;
    
    const tripTime = (Date.now() - currentPassenger.pickupTime) / 1000;
    const expectedTime = distance * 8;
    
    let speedBonus = 0;
    if (tripTime < expectedTime * 0.5) speedBonus = 50;      
    else if (tripTime < expectedTime * 0.7) speedBonus = 35; 
    else if (tripTime < expectedTime) speedBonus = 20;       
    else if (tripTime < expectedTime * 1.3) speedBonus = 10; 
    else speedBonus = 0;                                      
    
    const hour = Math.floor(gameTime);
    let timeMultiplier = 1.0;
    if (hour >= 20 || hour < 6) timeMultiplier = 1.8;  
    else if (hour >= 17 && hour < 20) timeMultiplier = 1.4; 
    else if (hour >= 7 && hour < 9) timeMultiplier = 1.3;   
    
    const passengerType = PASSENGER_TYPES[currentPassenger.type];
    const typeMultiplier = passengerType.multiplier;
    
    const baseFare = currentPassenger.baseFare;
    const distanceFare = distance * 2;
    const totalBaseFare = Math.round((baseFare + distanceFare) * typeMultiplier * timeMultiplier);
    
    let tipPercentage = 0;
    if (tripTime < expectedTime * 0.5) tipPercentage = 0.5;      
    else if (tripTime < expectedTime * 0.7) tipPercentage = 0.35; 
    else if (tripTime < expectedTime) tipPercentage = 0.25;       
    else if (tripTime < expectedTime * 1.3) tipPercentage = 0.15; 
    else if (tripTime < expectedTime * 2) tipPercentage = 0.05;   
    else tipPercentage = 0;                                       
    
    tipPercentage *= passengerType.tipMultiplier;
    
    const tip = Math.round((totalBaseFare + speedBonus) * tipPercentage);
    
    console.log(`Trip Stats: Distance=${distance.toFixed(1)}, Time=${tripTime.toFixed(1)}s, Expected=${expectedTime.toFixed(1)}s, SpeedBonus=${speedBonus}, Tip%=${(tipPercentage*100).toFixed(0)}%`);
    
    return {
        base: totalBaseFare,
        speedBonus: speedBonus,
        tip: tip,
        total: totalBaseFare + speedBonus + tip
    };
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================
function togglePassengerList() {
    const list = document.getElementById('passenger-list');
    if (!list) return;
    
    list.classList.toggle('active');
    
    if (list.classList.contains('active')) {
        const cards = document.getElementById('passenger-cards');
        if (!cards) return;
        
        cards.innerHTML = '';
        
        passengers.forEach(p => {
            const card = document.createElement('div');
            card.className = 'passenger-card';
            
            const typeName = PASSENGER_TYPES[p.type].name;
            const tipInfo = PASSENGER_TYPES[p.type].tipMultiplier;
            
            let tipRating = '⭐';
            if (tipInfo >= 1.5) tipRating = '⭐⭐⭐';
            else if (tipInfo >= 1.0) tipRating = '⭐⭐';
            
            card.innerHTML = `
                <div style="font-size:20px;margin-bottom:8px;font-weight:bold;"> ${p.name}</div>
                <div style="color:#aaa;margin:4px 0;">Type: <span style="color:#FFD700">${typeName}</span></div>
                <div style="color:#4CAF50;font-size:14px;margin-top:8px;">Tip Rating: ${tipRating}</div>
                <div style="color:#4CAF50;font-size:16px;margin-top:8px;"> Ready to ride</div>
            `;
            
            card.onclick = () => selectPassenger(p);
            cards.appendChild(card);
        });
    }
}

function selectPassenger(passenger) {
    currentPassenger = passenger;
    gameState = 'going_to_pickup';
    
    togglePassengerList();
    
    const pickupGeo = new THREE.CylinderGeometry(5, 5, 2, 16);
    const pickupMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8
    });
    destinationMarker = new THREE.Mesh(pickupGeo, pickupMat);
    destinationMarker.position.set(passenger.pickup.x, 1, passenger.pickup.z);
    scene.add(destinationMarker);
    
    const ringGeo = new THREE.RingGeometry(8, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
    });
    const pickupRing = new THREE.Mesh(ringGeo, ringMat);
    pickupRing.rotation.x = -Math.PI / 2;
    pickupRing.position.set(passenger.pickup.x, 0.5, passenger.pickup.z);
    scene.add(pickupRing);
    currentPassenger.pickupRing = pickupRing;
    
    const beaconGeo = new THREE.CylinderGeometry(0.5, 0.5, 50, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(passenger.pickup.x, 25, passenger.pickup.z);
    scene.add(beacon);
    currentPassenger.pickupBeacon = beacon;
    
    const nameElement = document.getElementById('current-passenger-name');
    const typeElement = document.getElementById('current-passenger-type');
    const infoElement = document.getElementById('passenger-info');
    
    if (nameElement) nameElement.textContent = passenger.name;
    if (typeElement) typeElement.textContent = PASSENGER_TYPES[passenger.type].name;
    if (infoElement) infoElement.classList.add('active');
    
    const typeName = PASSENGER_TYPES[passenger.type].name;
    const tipRating = PASSENGER_TYPES[passenger.type].tipMultiplier >= 1.5 ? '💰💰💰' : 
                      PASSENGER_TYPES[passenger.type].tipMultiplier >= 1.0 ? '💰💰' : '💰';
    const gameStateEl = document.getElementById('game-state');
    if (gameStateEl) {
        gameStateEl.textContent = 'PICK UP';
        gameStateEl.className = 'pickup';
    }
     showNotification(`Pick up ${passenger.name} (${typeName}) ${tipRating} - Go to GREEN marker!`, 3000);
}

function showNotification(message, duration = 2500) {
    const notif = document.getElementById('notification');
    if (!notif) return;
    
    notif.textContent = message;
    notif.classList.add('active');
    notif.style.display = 'block';
    
    setTimeout(() => {
        notif.classList.remove('active');
        setTimeout(() => {
            notif.style.display = 'none';
        }, 300);
    }, duration);
}

window.togglePassengerList = togglePassengerList;

init();