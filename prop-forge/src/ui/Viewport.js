// Three.js scene: shows the built pieces, insert "ghosts", cut planes and
// a move gizmo. Talks to the app through callbacks only.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PIECE_COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b72cf', '#e56b9f', '#4fb0c6', '#c9a227', '#7bc96f', '#d9813b', '#6c8ead', '#b5656d'];
const TAG_COLORS = { '-1': '#c2553a', '-2': '#d9c9a3', '-3': '#e8a23a', '-4': '#d9c9a3' };

export class Viewport {
  constructor(el, cb) {
    this.el = el;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 50000);
    this.camera.position.set(900, 400, 2400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 2, 3);
    this.camera.add(sun);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x302820, 0.6));

    this.modelGroup = new THREE.Group();
    this.ghostGroup = new THREE.Group();
    this.cutGroup = new THREE.Group();
    this.scene.add(this.modelGroup, this.ghostGroup, this.cutGroup);
    this.grid = null;

    this.proxy = new THREE.Object3D();
    this.scene.add(this.proxy);
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.9);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
      if (!e.value && this.gizmoTarget) this.cb.onGizmoEnd?.(this.gizmoTarget);
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.gizmoTarget) this.cb.onGizmo?.(this.gizmoTarget, this.proxy.position.toArray());
    });

    this.meshes = [];
    this.raycaster = new THREE.Raycaster();
    this.down = null;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => { this.down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', (e) => {
      if (!this.down || this.gizmo.dragging) return;
      const moved = Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]);
      this.down = null;
      if (moved < 4) this.pick(e);
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.el.removeChild(this.renderer.domElement);
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setBackground(dark) {
    this.scene.background = new THREE.Color(dark ? '#16181d' : '#e9ecf1');
    if (this.grid) this.grid.material.opacity = dark ? 0.25 : 0.35;
  }

  // pieces from the engine; colors: function(piece, index, tag) -> css color
  setPieces(pieces, { colorOf, offsets }) {
    for (const m of this.meshes) { m.geometry.dispose(); this.modelGroup.remove(m); }
    this.meshes = [];
    const mat = this.material || (this.material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide }));
    pieces.forEach((p, i) => {
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.verts, 3));
      g.setIndex(new THREE.BufferAttribute(p.tris, 1));
      g = toCreasedNormals(g, Math.PI / 5);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.tris.length * 3), 3));
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData = { piece: p, index: i };
      if (offsets && offsets[i]) mesh.position.fromArray(offsets[i]);
      this.modelGroup.add(mesh);
      this.meshes.push(mesh);
    });
    this.recolor(colorOf);
  }

  recolor(colorOf) {
    this.colorOf = colorOf;
    const c = new THREE.Color();
    for (const mesh of this.meshes) {
      const { piece, index } = mesh.userData;
      const attr = mesh.geometry.getAttribute('color');
      const cache = new Map();
      for (let t = 0; t < piece.triTags.length; t++) {
        const tag = piece.triTags[t];
        let col = cache.get(tag);
        if (!col) { c.set(colorOf(piece, index, tag)); col = [c.r, c.g, c.b]; cache.set(tag, col); }
        for (let k = 0; k < 3; k++) attr.setXYZ(t * 3 + k, col[0], col[1], col[2]);
      }
      attr.needsUpdate = true;
    }
  }

  setOffsets(offsets) {
    this.meshes.forEach((m, i) => m.position.fromArray(offsets[i] || [0, 0, 0]));
  }

  setGrid(bbox) {
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); }
    if (!bbox) return;
    const size = Math.max(bbox.max[0] - bbox.min[0], bbox.max[2] - bbox.min[2], 600) * 1.6;
    const div = Math.ceil(size / 100);
    this.grid = new THREE.GridHelper(div * 100, div, 0x888888, 0x666666);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.3;
    this.grid.position.set((bbox.min[0] + bbox.max[0]) / 2, bbox.min[1] - 2, (bbox.min[2] + bbox.max[2]) / 2);
    this.scene.add(this.grid);
  }

  fit(bbox, view = 'front') {
    if (!bbox) return;
    const c = new THREE.Vector3().fromArray(bbox.min).add(new THREE.Vector3().fromArray(bbox.max)).multiplyScalar(0.5);
    const size = new THREE.Vector3().fromArray(bbox.max).sub(new THREE.Vector3().fromArray(bbox.min));
    const r = size.length() / 2;
    const dist = r / Math.sin((this.camera.fov * Math.PI) / 360) * 1.05;
    const dir = view === 'side' ? new THREE.Vector3(1, 0.15, 0.05) : view === 'top' ? new THREE.Vector3(0.01, 1, 0.2) : new THREE.Vector3(0.28, 0.12, 1);
    this.camera.position.copy(c).add(dir.normalize().multiplyScalar(dist));
    this.controls.target.copy(c);
    this.camera.near = Math.max(0.5, dist / 200);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
  }

  // ghosts: [{id, type, a, b, r} | {id, type:'box', min, max, lid}]
  setGhosts(ghosts, selectedId) {
    this.ghostGroup.clear();
    for (const g of ghosts) {
      const sel = g.id === selectedId;
      const mat = new THREE.MeshBasicMaterial({ color: sel ? 0xffa53a : 0xff6a3a, transparent: true, opacity: sel ? 0.45 : 0.25, depthTest: false });
      let mesh;
      if (g.type === 'rod') {
        const a = new THREE.Vector3().fromArray(g.a), b = new THREE.Vector3().fromArray(g.b);
        const len = a.distanceTo(b);
        if (len < 0.01) continue;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, len, 24), mat);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      } else {
        const size = g.max.map((v, i) => v - g.min[i]);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
        mesh.position.set(...g.min.map((v, i) => v + size[i] / 2));
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: sel ? 0xffd27a : 0xff8a5a, depthTest: false, transparent: true }));
        mesh.add(edges);
      }
      mesh.renderOrder = 10;
      mesh.userData = { featureId: g.id };
      this.ghostGroup.add(mesh);
    }
  }

  // cuts: [{id, axis, pos, box:{min,max}}]
  setCuts(cuts, selectedId) {
    this.cutGroup.clear();
    for (const c of cuts) {
      const sel = c.id === selectedId;
      const k = { x: 0, y: 1, z: 2 }[c.axis];
      const size = c.box.max.map((v, i) => v - c.box.min[i] + 40);
      const center = c.box.min.map((v, i) => (v + c.box.max[i]) / 2);
      center[k] = c.pos;
      const dims = [0, 1, 2].filter((i) => i !== k).map((i) => size[i]);
      const geo = new THREE.PlaneGeometry(dims[0], dims[1]);
      const mat = new THREE.MeshBasicMaterial({ color: sel ? 0x3aa0ff : 0x7fb8ff, transparent: true, opacity: sel ? 0.35 : 0.16, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      if (k === 0) mesh.rotation.y = Math.PI / 2;
      if (k === 1) mesh.rotation.x = -Math.PI / 2;
      mesh.position.fromArray(center);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: sel ? 0x3aa0ff : 0x7fb8ff }));
      mesh.add(line);
      mesh.userData = { cutId: c.id };
      this.cutGroup.add(mesh);
    }
  }

  // target: {kind, id, axis?} or null
  setGizmo(target, position, enabled) {
    this.gizmoTarget = target;
    if (!target || !enabled || !position) { this.gizmo.detach(); return; }
    if (!this.gizmo.dragging) this.proxy.position.fromArray(position);
    this.gizmo.attach(this.proxy);
    const ax = target.axis;
    this.gizmo.showX = !ax || ax === 'x';
    this.gizmo.showY = !ax || ax === 'y';
    this.gizmo.showZ = !ax || ax === 'z';
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ghostHit = this.raycaster.intersectObjects(this.ghostGroup.children, false)[0];
    if (ghostHit) return this.cb.onPick?.({ kind: 'feature', id: ghostHit.object.userData.featureId });
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    const cutHit = this.raycaster.intersectObjects(this.cutGroup.children, false)[0];
    if (cutHit && (!hit || cutHit.distance < hit.distance + 1)) return this.cb.onPick?.({ kind: 'cut', id: cutHit.object.userData.cutId });
    if (hit) {
      const { piece, index } = hit.object.userData;
      return this.cb.onPick?.({ kind: 'mesh', tag: piece.triTags[hit.faceIndex], pieceIndex: index });
    }
    this.cb.onPick?.(null);
  }

  screenshot() { return this.renderer.domElement.toDataURL('image/png'); }
}

export function pieceColor(i) { return PIECE_COLORS[i % PIECE_COLORS.length]; }
export function tagColor(tag) { return TAG_COLORS[String(tag)] || '#999'; }
