import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GUI } from 'lil-gui';
import * as CANNON from 'cannon-es';

// --- Base Scene Configuration ---
const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();

// 加载天空盒环境贴图
const cubeLoader = new THREE.CubeTextureLoader().setPath('./'); 
const cubeTexture = await cubeLoader.loadAsync([
    'px.png', 'nx.png', 
    'py.png', 'ny.png', 
    'pz.png', 'nz.png'
]);
scene.background = cubeTexture;   
scene.environment = cubeTexture;  

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8; 

// --- Physics Engine Setup ---
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);

const physicsMaterial = new CANNON.Material('physics');
const contactMaterial = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
    friction: 0.2,
    restitution: 0.5
});
world.addContactMaterial(contactMaterial);

// Permanent Y=0 ground plane
const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(-1, 0, 0), Math.PI * 0.5);
world.addBody(groundBody);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

// --- Model Loader Setup ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Combined model list (Original assets + New Fox)
const staticModels = ['草草.glb', '草了.glb', '过山车.glb', '乐园.glb', '我草.glb', '浴缸.glb'];
const foxModelPath = 'fox.glb'; 
const rainBalls = [];
let sceneMinY = 0;

// 全局动画混合器数组
const mixers = [];

async function initModels() {
    let loadedCount = 0;
    const overallBox = new THREE.Box3();
    const loadingEl = document.getElementById('loading');

    const processModelPhysics = (gltfScene) => {
        gltfScene.updateMatrixWorld(true);
        gltfScene.traverse(node => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;

                const geometry = node.geometry.clone();
                geometry.applyMatrix4(node.matrixWorld);

                const position = geometry.attributes.position;
                const vertices = new Float32Array(position.count * 3);
                for (let i = 0; i < position.count; i++) {
                    vertices[i * 3] = position.getX(i);
                    vertices[i * 3 + 1] = position.getY(i);
                    vertices[i * 3 + 2] = position.getZ(i);
                }

                let indices;
                if (geometry.index) {
                    indices = Array.from(geometry.index.array);
                } else {
                    indices = [];
                    for (let i = 0; i < position.count; i++) indices.push(i);
                }

                const trimesh = new CANNON.Trimesh(vertices, indices);
                const body = new CANNON.Body({ mass: 0, material: physicsMaterial });
                body.addShape(trimesh);
                world.addBody(body);
            }
        });

        const box = new THREE.Box3().setFromObject(gltfScene);
        overallBox.expandByPoint(box.min);
        overallBox.expandByPoint(box.max);
    };

    staticModels.forEach(path => {
        gltfLoader.load(path, (gltf) => {
            scene.add(gltf.scene);
            processModelPhysics(gltf.scene);
            
            if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(gltf.scene);
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
                mixers.push(mixer);
            }

            checkAllLoaded();
        });
    });

    gltfLoader.load(foxModelPath, (gltf) => {
        const fox = gltf.scene;
        scene.add(fox); 
        
        processModelPhysics(fox);

        if (gltf.animations && gltf.animations.length > 0) {
            const foxMixer = new THREE.AnimationMixer(fox);
            const action = foxMixer.clipAction(gltf.animations[0]);
            action.play();
            mixers.push(foxMixer); 
        }

        checkAllLoaded();
    });

    function checkAllLoaded() {
        loadedCount++;
        if(loadedCount === staticModels.length + 1) {
            sceneMinY = overallBox.min.y;
            groundBody.position.y = sceneMinY;
            
            // 🌟 修改：注销了更新文字提示的代码，完全静默加载
            // loadingEl.innerText = `场景加载完成！精确网格碰撞 (Trimesh) 已开启 | 地平线 Y: ${sceneMinY.toFixed(2)}`;
            // setTimeout(() => loadingEl.style.opacity = 0, 3000); 
        }
    }
}

// --- Ball Rain Effect ---
const ballGeometry = new THREE.SphereGeometry(1, 16, 16);
const ballColors = ['#fd0202', '#ffcc00', '#295cf6', '#06c300'];

window.addEventListener('dblclick', () => {
    for(let i = 0; i < 15; i++) {
        const radius = 0.1 + Math.random() * 0.15; 
        const chosenColor = ballColors[Math.floor(Math.random() * ballColors.length)];
        
        const ballMesh = new THREE.Mesh(
            ballGeometry, 
            new THREE.MeshStandardMaterial({ 
                color: chosenColor, 
                roughness: 0.1,  
                metalness: 0.3 
            })
        );
        ballMesh.scale.setScalar(radius);
        ballMesh.castShadow = true;
        scene.add(ballMesh);

        const ballBody = new CANNON.Body({
            mass: 0.5,
            shape: new CANNON.Sphere(radius),
            position: new CANNON.Vec3((Math.random()-0.5)*15, 15 + Math.random()*5, (Math.random()-0.5)*15),
            material: physicsMaterial
        });
        
        ballBody.velocity.set((Math.random()-0.5)*3, 0, (Math.random()-0.5)*3);
        world.addBody(ballBody);
        rainBalls.push({ mesh: ballMesh, body: ballBody });
    }
});

// --- GUI Debug Panel ---
const gui = new GUI();
const params = { 
    clearBalls: () => {
        rainBalls.forEach(b => { scene.remove(b.mesh); world.removeBody(b.body); });
        rainBalls.length = 0;
    }
};
gui.add(params, 'clearBalls').name('💥 清理所有小球');

// --- Camera & Orbit Controls ---
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(25, 18, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const clock = new THREE.Clock();
function tick() {
    const delta = clock.getDelta();

    world.step(1/60, delta, 3);

    rainBalls.forEach(b => {
        b.mesh.position.copy(b.body.position); 
        b.mesh.quaternion.copy(b.body.quaternion);
    });

    mixers.forEach(mixer => mixer.update(delta));

    controls.update();
    renderer.render(scene, camera);
    window.requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

initModels();
tick();