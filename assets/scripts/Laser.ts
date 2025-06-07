const { ccclass, property } = cc._decorator;

@ccclass
export default class Laser extends cc.Component {

    private isTouchingShield: boolean = false;
    private wasTouchingShield: boolean = false;  // ⬅ 前一幀接觸狀態
    private framesSinceNoTouch = 0;              // ⬅ 離開後累積幀數
    private isClipped: boolean = false;

    private originalHeight: number = 0;
    private originalColliderSize: cc.Size = null;
    private originalColliderOffset: cc.Vec2 = null;

    @property({ type: cc.Node, tooltip: "關聯的盾牌" })
    bar_shield: cc.Node = null;

    onLoad() {
        const col = this.node.getComponent(cc.PhysicsBoxCollider);
        this.originalWidth = this.node.width;
        this.originalHeight = this.node.height;
        if (col) {
            this.originalColliderSize = col.size.clone();
            this.originalColliderOffset = col.offset.clone();
        }
    }

    update() {
        // ⬇ 若本幀接觸盾牌 → 立即裁切
        if (this.isTouchingShield) {
            this.clipLaserToShield();
            this.framesSinceNoTouch = 0;
        } else {
            // ⬇ 若已經有兩幀沒碰到了，才還原
            if (!this.wasTouchingShield) {
                this.framesSinceNoTouch++;
                if (this.framesSinceNoTouch >= 2 && this.isClipped) {
                    this.restoreLaser();
                }
            }
        }

        // 更新狀態記錄
        this.wasTouchingShield = this.isTouchingShield;
        this.isTouchingShield = false; // 等 onBeginContact 設為 true
    }

    onBeginContact(contact, selfCol, otherCol) {
        if (otherCol.node.name === 'bar_shield') {
            this.isTouchingShield = true;
        }
    }

    clipLaserToShield() {
        if (!this.bar_shield) return;

        const shieldCol = this.bar_shield.getComponent(cc.PhysicsBoxCollider);
        const laserCol = this.node.getComponent(cc.PhysicsBoxCollider);
        if (!shieldCol || !laserCol) return;

        const shieldTop = this.bar_shield.y + shieldCol.offset.y + (shieldCol.size.height * this.bar_shield.scaleY) / 2;
        const laserTop = this.node.y;

        let newHeight = Math.max(0, Math.round(laserTop - shieldTop));
        this.node.height = newHeight;

        laserCol.size.height = newHeight;
        laserCol.offset.y = -newHeight / 2;

        // ✅ 若太短則 disable collider
        if (newHeight < 5) {
            laserCol.enabled = false;
            cc.log("[Laser] 已裁切過短，禁用 Collider");
        } else {
            laserCol.enabled = true;
        }

        laserCol.apply();
        this.isClipped = true;
    }


    restoreLaser() {
        const laserCol = this.node.getComponent(cc.PhysicsBoxCollider);
        if (!laserCol) return;

        this.node.height = this.originalHeight;

        laserCol.size = this.originalColliderSize.clone();
        laserCol.offset = this.originalColliderOffset.clone();
        laserCol.enabled = true; // ✅ 還原時重新啟用
        laserCol.apply();

        this.isClipped = false;
    }

}
