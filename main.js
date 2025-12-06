// main.js
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/** ========= CONFIGURACIÓN ========= */
const WORLD_SIZE = 160; // Mapa un poco más pequeño para encontrar esferas
const SPHERE_COUNT = 15; // Cantidad de esferas flotantes
const PLAYER_RADIUS = 0.5;
const VR_WALK_SPEED = 4.0;
const WORLD_RADIUS = WORLD_SIZE * 0.5 - 2.0;
const HDRI_FALLBACK = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr';

/** ========= DOM / UI ========= */
const hudScore = document.getElementById('score');
let score = 0;

/** ========= RENDERER / SCENA ========= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06101a);
scene.fog = new THREE.FogExp2(0x06101a, 0.02);

// Cámara (Player Rig)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
const player = new THREE.Group();
player.position.set(0, 0, 3); // Inicia en el centro
player.add(camera);
scene.add(player);

/** ========= ILUMINACIÓN & AMBIENTE ========= */
const hemiLight = new THREE.HemisphereLight(0x8fb2ff, 0x0a0c10, 0.5);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight(0xcfe2ff, 1.5);
moonLight.position.set(50, 100, -50);
moonLight.castShadow = true;
scene.add(moonLight);

// Cielo Estrellado (Simplificado para rendimiento)
const starGeo = new THREE.BufferGeometry();
const starCount = 2000;
const starPos = new Float32Array(starCount * 3);
for(let i=0; i<starCount*3; i++) starPos[i] = (Math.random()-0.5) * 400;
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.5, transparent: true});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

/** ========= SUELO Y LÍMITES ========= */
// Textura de pasto (usando colores básicos para asegurar que cargue sin assets externos complejos)
const groundGeo = new THREE.CircleGeometry(WORLD_RADIUS, 64);
const groundMat = new THREE.MeshStandardMaterial({ 
    color: 0x1a2b15, // Verde oscuro nocturno
    roughness: 0.8,
    metalness: 0.1
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Pared invisible (Límite visual sutil)
const wallGeo = new THREE.CylinderGeometry(WORLD_RADIUS, WORLD_RADIUS, 5, 32, 1, true);
const wallMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.05, side: THREE.DoubleSide });
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.y = 2.5;
scene.add(wall);

/** ========= OBJETOS DEL ESCENARIO (Árboles) ========= */
function createTree(x, z) {
    const trunkH = 1.5 + Math.random();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, trunkH, 7),
        new THREE.MeshStandardMaterial({ color: 0x3d2817 })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;

    const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x0f2d1c })
    );
    leaves.position.y = trunkH + 1;
    leaves.castShadow = true;

    const tree = new THREE.Group();
    tree.add(trunk, leaves);
    tree.position.set(x, 0, z);
    scene.add(tree);
}

// Generar bosque aleatorio
for (let i = 0; i < 100; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = 5 + Math.random() * (WORLD_RADIUS - 5);
    createTree(Math.cos(angle) * rad, Math.sin(angle) * rad);
}

/** ========= SISTEMA DE ESFERAS (OBJETIVOS) ========= */
const spheres = [];
const sphereGroup = new THREE.Group(); // Grupo para raycasting fácil
scene.add(sphereGroup);

function createSphere() {
    const geo = new THREE.SphereGeometry(0.5, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        emissive: 0x222222,
        roughness: 0.2,
        metalness: 0.8
    });
    const sphere = new THREE.Mesh(geo, mat);
    
    respawnSphere(sphere); // Posicionar aleatoriamente
    sphereGroup.add(sphere);
    spheres.push(sphere);
}

function respawnSphere(obj) {
    // Posición aleatoria dentro del radio, altura entre 1m y 4m
    const angle = Math.random() * Math.PI * 2;
    const rad = 4 + Math.random() * (WORLD_RADIUS - 6);
    obj.position.set(
        Math.cos(angle) * rad,
        1.5 + Math.random() * 3.0, // Flotando
        Math.sin(angle) * rad
    );
    // Color aleatorio nuevo
    obj.material.color.setHex(Math.random() * 0xffffff);
}

// Crear las esferas iniciales
for(let i=0; i<SPHERE_COUNT; i++) createSphere();

/** ========= SONIDO ========= */
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
let hitSoundBuffer = null;

// Cargar sonido de disparo (usaremos el chime que tenías o uno genérico)
audioLoader.load('assets/audio/chime.mp3', (buffer) => {
    hitSoundBuffer = buffer;
});

function playHitSound(pos) {
    if(!hitSoundBuffer) return;
    const sound = new THREE.PositionalAudio(listener);
    sound.setBuffer(hitSoundBuffer);
    sound.setRefDistance(10);
    sound.setVolume(1.5);
    // Crear un objeto temporal en la posición del impacto para emitir el sonido
    const dummy = new THREE.Object3D();
    dummy.position.copy(pos);
    scene.add(dummy);
    dummy.add(sound);
    sound.play();
    // Limpiar después de que suene
    setTimeout(() => { scene.remove(dummy); }, 2000);
}

/** ========= VR CONTROLLERS & RAYCASTER ========= */
document.body.appendChild(VRButton.createButton(renderer));

const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);

// Configurar línea láser para apuntar
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-100)]);
const laserMat = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
const laserLine = new THREE.Line(laserGeo, laserMat);
// Clona la línea para que ambos controles la tengan
const laser1 = laserLine.clone();
const laser2 = laserLine.clone();

controller1.add(laser1);
controller2.add(laser2);

scene.add(controller1, controller2);

// Modelos visuales de los controles (manos/grips)
const controllerModelFactory = new XRControllerModelFactory();
const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);
const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
scene.add(controllerGrip2);

// Lógica de Disparo (Raycaster)
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

function checkShoot(controller) {
    // Configurar raycaster desde la posición y orientación del control
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // Detectar intersección con esferas
    const intersects = raycaster.intersectObjects(sphereGroup.children);

    if (intersects.length > 0) {
        const hitObj = intersects[0].object;
        
        // EFECTOS AL ACERTAR
        playHitSound(hitObj.position); // Sonido
        respawnSphere(hitObj); // Reaparecer en otro lado
        
        // Sumar puntos
        score++;
        hudScore.innerText = score;

        // Feedback háptico (vibración del control)
        if (controller.gamepad && controller.gamepad.hapticActuators) {
             controller.gamepad.hapticActuators[0].pulse(1.0, 100);
        }
    }
}

// Evento: Al presionar gatillo (Select)
controller1.addEventListener('selectstart', () => checkShoot(controller1));
controller2.addEventListener('selectstart', () => checkShoot(controller2));

/** ========= LOCOMOCIÓN (MOVIMIENTO CON JOYSTICK) ========= */
function handleMovement(dt) {
    const session = renderer.xr.getSession();
    if (!session) return;

    // Buscar input sources (controles)
    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        
        // Ejes usuales: 2 y 3 para thumbstick
        const axes = source.gamepad.axes;
        // Algunos navegadores usan 2/3, otros 0/1 dependiendo del perfil
        const x = axes[2] || axes[0] || 0; 
        const y = axes[3] || axes[1] || 0;

        // Deadzone para evitar drift
        if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1) continue;

        // Obtener dirección de la cámara (sin componente Y para no volar)
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0; 
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

        // Calcular vector de movimiento
        const moveVector = new THREE.Vector3();
        moveVector.addScaledVector(forward, -y * VR_WALK_SPEED * dt);
        moveVector.addScaledVector(right, x * VR_WALK_SPEED * dt);

        // Aplicar movimiento
        player.position.add(moveVector);

        // Mantener dentro de los límites (Círculo)
        const dist = Math.sqrt(player.position.x**2 + player.position.z**2);
        if (dist > WORLD_RADIUS - PLAYER_RADIUS) {
            const angle = Math.atan2(player.position.z, player.position.x);
            player.position.x = Math.cos(angle) * (WORLD_RADIUS - PLAYER_RADIUS);
            player.position.z = Math.sin(angle) * (WORLD_RADIUS - PLAYER_RADIUS);
        }
    }
}

/** ========= LOOP PRINCIPAL ========= */
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    // Animación de esferas (flotar arriba/abajo)
    const time = clock.getElapsedTime();
    spheres.forEach((s, i) => {
        s.position.y += Math.sin(time * 2 + i) * 0.005;
        s.rotation.y += 0.01;
    });

    // Movimiento del jugador
    if (renderer.xr.isPresenting) {
        handleMovement(dt);
    }

    renderer.render(scene, camera);
});

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});