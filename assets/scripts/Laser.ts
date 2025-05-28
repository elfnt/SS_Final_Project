const { ccclass, property } = cc._decorator;

@ccclass
export default class Laser extends cc.Component {

    private flip = false;
    private originalTop: number = 0;
    private originalHeight: number = 0;
    private originalColliderSize: cc.Size = null;
    private originalColliderOffset: cc.Vec2 = null;

    private isTouchingShield: boolean = false;
    private isClipped: boolean = false;

    @property({ type: cc.Node, tooltip: "目前關聯的盾牌節點" })
    bar_shield: cc.Node = null;

    onLoad() {
        this.originalHeight = this.node.height;
        this.originalTop = this.node.y;

        const laserCollider = this.node.getComponent(cc.PhysicsBoxCollider);
        if (laserCollider) {
            this.originalColliderSize = laserCollider.size.clone();
            this.originalColliderOffset = laserCollider.offset.clone();
        }
    }

    start() {
        this.schedule(() => {
            this.flip = !this.flip;
            this.node.scaleX = this.flip ? -1 : 1;
        }, 0.25);
    }

    update() {
        if (this.isTouchingShield && !this.isClipped) {
            this.clipLaserToShield();
        } else if (!this.isTouchingShield && this.isClipped) {
            this.restoreLaser();
        }
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === 'bar_shield') {
            this.isTouchingShield = true;
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === 'bar_shield') {
            this.isTouchingShield = false;
        }
    }

    clipLaserToShield() {
        if (!this.bar_shield) return;

        const shieldCol = this.bar_shield.getComponent(cc.PhysicsBoxCollider);
        const shieldTop = this.bar_shield.y + shieldCol.offset.y + (shieldCol.size.height * this.bar_shield.scaleY) / 2;

        const laserTop = this.node.y;
        let newHeight = laserTop - shieldTop;
        newHeight = Math.max(0, Math.round(newHeight));

        this.node.height = newHeight;
        cc.log("newheight = ",newHeight);
        const laserCol = this.node.getComponent(cc.PhysicsBoxCollider);
        if (laserCol) {
            laserCol.size.height = newHeight;
            laserCol.offset.y = -newHeight / 2;
            laserCol.apply();
        }

        this.isClipped = true;
    }

    restoreLaser() {
        this.node.height = this.originalHeight;

        const laserCol = this.node.getComponent(cc.PhysicsBoxCollider);
        if (laserCol) {
            laserCol.size = this.originalColliderSize.clone();
            laserCol.offset = this.originalColliderOffset.clone();
            laserCol.apply();
        }

        this.isClipped = false;
    }
}
