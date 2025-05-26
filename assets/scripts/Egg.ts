// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

const {ccclass, property} = cc._decorator;

@ccclass
export default class NewClass extends cc.Component {
    // Basic movement properties
    @property
    moveSpeed: number = 5;

    @property
    jumpForce: number = 10;

    // Sprite properties for different egg states
    @property({type: cc.SpriteFrame, tooltip: "Normal egg appearance"})
    normalSprite: cc.SpriteFrame = null;

    @property({type: cc.SpriteFrame, tooltip: "Cracked egg appearance"})
    crackedSprite: cc.SpriteFrame = null;

    @property({type: cc.SpriteFrame, tooltip: "Broken egg appearance"})
    brokenSprite: cc.SpriteFrame = null;

    // Life bar properties
    @property
    maxLife: number = 100;

    // Debug controls
    @property({tooltip: "Enable keyboard debug controls (C to crack, B to break)"})
    enableDebugControls: boolean = true;

    // Ground group name
    @property({tooltip: 'Name of the ground group'})
    groundGroup: string = 'Ground';

    private sprite: cc.Sprite = null;
    private velocity: cc.Vec2 = new cc.Vec2(0, 0);
    private currentLife: number = 100;
    private lastY: number = 0;
    private isGrounded: boolean = true;
    private isAlive: boolean = true;
    private lastGroundContact = null;

    onLoad() {
        this.currentLife = this.maxLife;
        this.lastY = this.node.position.y;
        
        // Get the sprite component
        this.sprite = this.getComponent(cc.Sprite);
        if (!this.sprite) {
            this.sprite = this.node.getComponentInChildren(cc.Sprite);
        }
        
        // Set initial sprite
        if (this.sprite && this.normalSprite) {
            this.sprite.spriteFrame = this.normalSprite;
        }
    }

    onEnable() {
        // Register keyboard events for debug controls
        if (this.enableDebugControls) {
            cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    }

    onDisable() {
        // Unregister keyboard events
        if (this.enableDebugControls) {
            cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    }

    onKeyDown(event) {
        // Debug controls - C to crack egg, B to break egg
        if (!this.isAlive) return;
        
        switch(event.keyCode) {
            case cc.macro.KEY.c:
                // Set health to 50% (cracked state)
                this.currentLife = this.maxLife / 2;
                this.updateEggAppearance();
                cc.log("Debug: Egg cracked by keyboard shortcut");
                break;
                
            case cc.macro.KEY.b:
                // Set health to 0 (broken state) and die
                this.currentLife = 0;
                this.die();
                cc.log("Debug: Egg broken by keyboard shortcut");
                break;
        }
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.group !== this.groundGroup) return;
        
        // Prevent multiple damage calculations for same ground contact
        if (this.lastGroundContact === otherCollider.node) return;
        this.lastGroundContact = otherCollider.node;
        
        // Calculate fall damage
        let fallHeight = this.lastY - this.node.position.y;
        cc.log(`Fall height: ${fallHeight}, Last Y: ${this.lastY}, Current Y: ${this.node.position.y}`);
        
        // Apply damage if fall height > 100
        if (fallHeight > 100) {
            // Calculate damage: 0% at 100px, 100% at 500px
            let normalized = Math.min((fallHeight - 100) / 400, 1);
            let damage = Math.floor(this.maxLife * normalized);
            
            // Apply damage and update appearance
            this.currentLife = Math.max(0, this.currentLife - damage);
            this.updateEggAppearance();
            
            if (this.currentLife <= 0) {
                this.die();
            }
            
            cc.log(`Fall damage: ${damage}, Remaining life: ${this.currentLife}`);
        }
        
        // Reset physics state
        this.isGrounded = true;
        this.velocity.y = 0;
        this.lastY = this.node.position.y;
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.group !== this.groundGroup) return;
        
        this.isGrounded = false;
        this.lastY = this.node.position.y;
        
        // Reset ground contact tracking
        if (this.lastGroundContact === otherCollider.node) {
            this.lastGroundContact = null;
        }
    }

    update(dt) {
        if (!this.isAlive) return;
        
        // Apply gravity when in air
        if (!this.isGrounded) {
            this.velocity.y += -20 * dt;
        }
        
        // Update position
        let pos = this.node.position;
        pos.y += this.velocity.y;
        
        // Track highest position during fall
        if (!this.isGrounded && pos.y > this.lastY) {
            this.lastY = pos.y;
        }
        
        this.node.setPosition(pos);
    }

    private updateEggAppearance() {
        if (!this.sprite) return;
        
        if (this.currentLife <= 0) {
            if (this.brokenSprite) {
                this.sprite.spriteFrame = this.brokenSprite;
            }
        } else if (this.currentLife < this.maxLife) {
            if (this.crackedSprite) {
                this.sprite.spriteFrame = this.crackedSprite;
            }
        } else {
            if (this.normalSprite) {
                this.sprite.spriteFrame = this.normalSprite;
            }
        }
    }

    die() {
        this.isAlive = false;
        this.currentLife = 0;
        
        if (this.sprite && this.brokenSprite) {
            this.sprite.spriteFrame = this.brokenSprite;
        }
        
        cc.log("Egg is broken! Game Over.");
        // You could emit an event here for game over handling
        // this.node.emit('egg-died');
    }
}