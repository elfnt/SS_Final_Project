const { ccclass, property } = cc._decorator;

@ccclass
export default class Egg extends cc.Component {
    @property moveSpeed = 5;
    @property jumpForce = 10;

    @property({ type: cc.SpriteFrame, tooltip: 'Normal egg appearance' })
    normalSprite: cc.SpriteFrame = null;

    @property({ type: cc.SpriteFrame, tooltip: 'Cracked egg appearance' })
    crackedSprite: cc.SpriteFrame = null;

    @property({ type: cc.SpriteFrame, tooltip: 'Broken egg appearance' })
    brokenSprite: cc.SpriteFrame = null;

    @property maxLife = 100;

    @property({ tooltip: 'Enable keyboard debug (C crack / B break)' })
    enableDebugControls = true;

    @property({ tooltip: 'Name of the ground group' })
    groundGroup = 'Ground';

    private sprite: cc.Sprite = null;
    private velocity = cc.v2(0, 0);
    private currentLife = 100;
    private lastY = 0;
    private isAlive = true;
    private lastGroundContact: cc.Node = null;
    private rb: cc.RigidBody = null;
    private respawnPoint: cc.Vec2 = null;

    onLoad() {
        this.sprite = this.getComponent(cc.Sprite) || this.node.getComponentInChildren(cc.Sprite);
        if (this.sprite && this.normalSprite) {
            this.sprite.spriteFrame = this.normalSprite;
        }

        this.rb = this.getComponent(cc.RigidBody);
        this.respawnPoint = this.node.getPosition();
        this.currentLife = this.maxLife;
        this.lastY = this.node.y;
    }

    onEnable() {
        if (this.enableDebugControls) {
            cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    }

    onDisable() {
        if (this.enableDebugControls) {
            cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    }

    private onKeyDown(e: cc.Event.EventKeyboard) {
        if (!this.isAlive) return;
        switch (e.keyCode) {
            case cc.macro.KEY.c:
                this.currentLife = this.maxLife / 2;
                this.updateEggAppearance();
                break;
            case cc.macro.KEY.b:
                this.currentLife = 0;
                this.die();
                break;
        }
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        const other = otherCollider.node;
        const name = other.name.toLowerCase();
        const isSafe = name.includes("spring") || name.includes("sponge");
    
        // ✅ 安全方塊：略過傷害，但要更新 lastY
        if (isSafe) {
            cc.log(`Safe landing on ${other.name}, skipping damage.`);
            this.lastY = this.node.y;  // ✅ 在這裡更新
            return;
        }
    
        if (other.group !== this.groundGroup) return;
        if (this.lastGroundContact === other) return;
        this.lastGroundContact = other;
    
        const fallHeight = this.lastY - this.node.y;
        cc.log(`Fall height: ${fallHeight}`);
    
        if (fallHeight < 3) {
            cc.log(`Fall too short (${fallHeight}), ignoring.`);
            return;
        }
    
        if (fallHeight > 100) {
            const normalized = Math.min((fallHeight - 100) / 400, 1);
            const damage = Math.floor(this.maxLife * normalized);
            this.currentLife = Math.max(0, this.currentLife - damage);
            this.updateEggAppearance();
    
            if (this.currentLife <= 0) {
                this.die();
            }
    
            cc.log(`Fall damage: ${damage}, Remaining life: ${this.currentLife}`);
        }
    
        this.lastY = this.node.y;  // ✅ 正常地板落地才更新
    }
    
    
    
    onEndContact(contact, selfCol, otherCol) {
        if (otherCol.node.group !== this.groundGroup) return;
        if (this.lastGroundContact === otherCol.node) {
            this.lastGroundContact = null;
        }
        this.lastY = this.node.y;
    }

    update(dt: number) {
        if (!this.isAlive) return;
    
        if (!this.rb) {
            this.velocity.y += -20 * dt;
            let pos = this.node.position;
            pos.y += this.velocity.y;
            this.node.setPosition(pos);
        }
    
        // ✅ 只有在往上移動時更新最高點
        if (this.node.y > this.lastY) {
            this.lastY = this.node.y;
        }
    }

    private updateEggAppearance() {
        if (!this.sprite) return;

        if (this.currentLife <= 0 && this.brokenSprite) {
            this.sprite.spriteFrame = this.brokenSprite;
        } else if (this.currentLife < this.maxLife && this.crackedSprite) {
            this.sprite.spriteFrame = this.crackedSprite;
        } else if (this.normalSprite) {
            this.sprite.spriteFrame = this.normalSprite;
        }
    }

    private die() {
        if (!this.isAlive) return;

        this.isAlive = false;
        this.currentLife = 0;
        this.updateEggAppearance();

        cc.log("Egg broken. Respawning in 3 seconds...");

        this.scheduleOnce(() => this.respawn(), 3);
    }

    public respawn() {
        this.node.setPosition(this.respawnPoint);

        if (this.rb) {
            this.rb.linearVelocity = cc.v2(0, 0);
            this.rb.angularVelocity = 0;
            this.rb.awake = true;
        }

        this.currentLife = this.maxLife;
        this.updateEggAppearance();

        this.isAlive = true;
        this.velocity = cc.v2(0, 0);
        this.lastGroundContact = null;
        this.lastY = this.node.y;

        const collider = this.getComponent(cc.PhysicsBoxCollider);
        if (collider) {
            collider.enabled = true;
            collider.apply(); // 確保碰撞箱重新啟用
        }
    }
}
