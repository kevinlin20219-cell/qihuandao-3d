import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// 碰撞分组：关卡 = 1，角色 = 2。角色之间互不阻挡（避免在吊桥上互相卡住），只和关卡碰撞。
export const GROUP_LEVEL = (0x0001 << 16) | 0xffff;
export const GROUP_CHAR = (0x0002 << 16) | 0x0001;
export const QUERY_CHAR = (0x0002 << 16) | 0x0001;
export const QUERY_LEVEL_ONLY = (0x0004 << 16) | 0x0001;

export class Physics {
  R: typeof RAPIER;
  world: RAPIER.World;

  static async create(): Promise<Physics> {
    await RAPIER.init();
    const p = new Physics();
    p.R = RAPIER;
    p.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    return p;
  }

  /** 静态盒子碰撞体。center/size 为米，rotY 为弧度。 */
  box(center: THREE.Vector3Like, size: THREE.Vector3Like, rotY = 0, rotX = 0): RAPIER.Collider {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ'));
    const desc = this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCollisionGroups(GROUP_LEVEL);
    return this.world.createCollider(desc);
  }

  cylinder(center: THREE.Vector3Like, radius: number, height: number): RAPIER.Collider {
    const desc = this.R.ColliderDesc.cylinder(height / 2, radius)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(GROUP_LEVEL);
    return this.world.createCollider(desc);
  }

  /** 静态三角网格碰撞（0145：自然岩路面，和旧地面并存）。vertices 为世界坐标米。 */
  trimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.Collider {
    const desc = this.R.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(GROUP_LEVEL);
    return this.world.createCollider(desc);
  }

  /** 可移动的运动学物体（巨石、桥板）。 */
  kinematicBall(center: THREE.Vector3Like, radius: number): RAPIER.RigidBody {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z));
    this.world.createCollider(this.R.ColliderDesc.ball(radius).setCollisionGroups(GROUP_LEVEL), body);
    return body;
  }

  remove(c: RAPIER.Collider | null) {
    if (c) this.world.removeCollider(c, true);
  }

  /** 从 from 朝 dir 投射射线，只检测关卡。返回命中距离或 null。 */
  ray(from: THREE.Vector3, dir: THREE.Vector3, maxToi: number): number | null {
    const ray = new this.R.Ray({ x: from.x, y: from.y, z: from.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRay(ray, maxToi, true, undefined, QUERY_LEVEL_ONLY);
    return hit ? (hit as any).timeOfImpact ?? (hit as any).toi : null;
  }

  step() { this.world.step(); }
}
