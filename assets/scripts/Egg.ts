// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

const {ccclass, property} = cc._decorator;

@ccclass
export default class NewClass extends cc.Component {

    @property(cc.Label)
    label: cc.Label = null;

    @property
    text: string = 'hello';

    // Basic movement properties
    @property
    moveSpeed: number = 5;

    @property
    jumpForce: number = 10;

    private velocity: cc.Vec2 = new cc.Vec2(0, 0);
    private isGrounded: boolean = true;
    private isAlive: boolean = true;

    // Life bar properties
    @property
    maxLife: number = 100;
    private currentLife: number = 100;
    private lastY: number = 0;

    // Add a property to set the ground group name
    @property({tooltip: 'Name of the ground group'})
    groundGroup: string = 'Ground';

    // LIFE-CYCLE CALLBACKS:

    onLoad() {
        this.currentLife = this.maxLife;
        this.lastY = this.node.position.y;
    }

    // Cocos Creator 2.x will call this automatically if the collider is present
    onCollisionEnter(other, self) {
        if (other.node.group === this.groundGroup) {
            // Calculate fall damage
            let fallHeight = this.lastY;
            if (fallHeight > 0) {
                let damage = Math.floor(fallHeight * 2); // Tune multiplier as needed
                this.currentLife -= damage;
                if (this.currentLife <= 0) {
                    this.currentLife = 0;
                    this.die();
                }
            }
            this.isGrounded = true;
            this.velocity.y = 0;
            this.lastY = 0;
        }
    }

    onCollisionExit(other, self) {
        if (other.node.group === this.groundGroup) {
            this.isGrounded = false;
        }
    }

    update(dt) {
        if (!this.isAlive) return;
        // Gravity
        if (!this.isGrounded) {
            this.velocity.y += -20 * dt; // gravity
        }
        // Move only vertically (no player control)
        let pos = this.node.position;
        pos.y += this.velocity.y;
        if (!this.isGrounded && pos.y > this.lastY) {
            this.lastY = pos.y;
        }
        this.node.setPosition(pos);
        // TODO: Update life bar UI if you have one
    }

    // Call this when the egg dies
    die() {
        this.isAlive = false;
        // Add logic for game over (e.g., show game over screen)
    }
}