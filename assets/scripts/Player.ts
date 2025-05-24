// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html
const { ccclass, property } = cc._decorator;
import GameManager from "./GameManager";

@ccclass
export default class Player extends cc.Component {
    @property moveSpeed: number = 200;
    @property jumpHeight: number = 150;
    @property(cc.Node) cameraNode: cc.Node = null;
    @property({ type: cc.AudioClip }) jumpSound: cc.AudioClip = null;
    @property({ type: cc.AudioClip }) deathSound: cc.AudioClip = null;

    private animation: cc.Animation = null;
    private direction: cc.Vec2 = cc.Vec2.ZERO;
    private isJumping: boolean = false;
    private isOnGround: boolean = false;
    private startPosition: cc.Vec2 = cc.v2(0, 0);
    private isDead: boolean = false;
    private physicsCollider: cc.PhysicsBoxCollider = null;
    private rb: cc.RigidBody = null;
    private isBlockedInAir: boolean = false;
    private invincible: boolean = false;
    private invincibleDuration: number = 1.0; // seconds

    onLoad() {
        this.animation = this.getComponent(cc.Animation);
        this.physicsCollider = this.getComponent(cc.PhysicsBoxCollider);
        this.rb = this.getComponent(cc.RigidBody);
        cc.director.getPhysicsManager().enabled = true;

        cc.log('[DEBUG] Player onLoad:', {
            collider: !!this.physicsCollider,
            colliderEnabled: this.physicsCollider ? this.physicsCollider.enabled : 'n/a',
            colliderSensor: this.physicsCollider ? this.physicsCollider.sensor : 'n/a',
            rb: !!this.rb,
            rbType: this.rb ? this.rb.type : 'n/a',
        });

        if (this.physicsCollider) {
            this.physicsCollider.friction = 0.2;
            this.physicsCollider.restitution = 0;
            this.physicsCollider.density = 1;
            this.physicsCollider.enabled = true;
            this.physicsCollider.apply();
        } else {
            cc.warn("[Player] Missing PhysicsBoxCollider component!");
        }

        this.addKeyboardListeners();
        this.startPosition = this.node.getPosition().clone();
    }

    start() {
        this.resetState();
    }

    addKeyboardListeners() {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    removeKeyboardListeners() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    onKeyDown(event: cc.Event.EventKeyboard) {
        if (this.isDead) return;

        switch (event.keyCode) {
            case cc.macro.KEY.left:
                this.direction.x = -1;
                this.node.scaleX = -Math.abs(this.node.scaleX);
                break;
            case cc.macro.KEY.right:
                this.direction.x = 1;
                this.node.scaleX = Math.abs(this.node.scaleX);
                break;
            case cc.macro.KEY.up:
                if (this.isOnGround) {
                    this.jump();
                }
                break;
        }
    }

    onKeyUp(event: cc.Event.EventKeyboard) {
        if (this.isDead) return;

        if (event.keyCode === cc.macro.KEY.left && this.direction.x === -1) {
            this.direction.x = 0;
        }
        if (event.keyCode === cc.macro.KEY.right && this.direction.x === 1) {
            this.direction.x = 0;
        }
    }

    update(dt: number) {
        if (this.isDead) return;

        this.handleMovement();
        this.updateCameraPosition();
        this.updateAnimationState();

        // Handle fall damage
        if (this.node.y < -320) {
            cc.log('[DEBUG] Player fell below -320, y=', this.node.y, 'rb:', this.rb ? this.rb.linearVelocity : 'n/a');
            // Remove disabling of collider/sensor here to allow recovery if player lands again
            // this.handleDeath("fall");
        }
        // Win condition
        if (this.node.x >= 1880) {
            cc.director.loadScene("Win");
        }

        // Always keep player upright (prevent tilting/rotation)
        this.node.angle = 0;
        if (this.rb) {
            this.rb.angularVelocity = 0;
            this.rb.fixedRotation = true;
        }
    }

    handleMovement() {
        if (this.isDead || !this.rb) return;

        // Set horizontal velocity, keep vertical velocity from physics
        let velocity = this.rb.linearVelocity;
        velocity.x = this.direction.x * this.moveSpeed;
        this.rb.linearVelocity = velocity;
    }

    onBeginContact(contact, selfCollider, otherCollider) {
        if (this.isDead) return;

        // Ground contact
        if (otherCollider.node.group === "Ground") {
            const normal = contact.getWorldManifold().normal;
            cc.log(`[DEBUG] Player: y=${this.node.y}, Ground group: ${otherCollider.node.group}, normal.y=${normal.y}`);
            // Only set on ground if contact normal is upwards (Player is above ground)
            if (-normal.y > 0.7) {
                this.isOnGround = true;
                this.isJumping = false;
                cc.log("[DEBUG] Player is now ON ground.");
            }
        }

        // Enemy contact
        if (otherCollider.node.group === "Enemy") {
            const normal = contact.getWorldManifold().normal;
            cc.log(`[DEBUG] Player-Enemy contact normal.y=${normal.y}`);
            // If Player is above the enemy (stomping), normal.y should be negative (pointing up from Player to Goomba)
            if (-normal.y > 0.7) {
                // Stomped the enemy, do NOT die
                cc.log("[DEBUG] Player stomped enemy, not dying.");
                this.bounce();
            } else {
                // If Player is not invincible and not dead, handle enemy damage
                if (!this.invincible && !this.isDead) {
                    this.handleDeath("enemy");
                    this.invincible = true;
                    this.scheduleOnce(() => { this.invincible = false; }, this.invincibleDuration);
                }
            }
        }
    }

    onEndContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.group === "Ground") {
            cc.log("[DEBUG] onEndContact with Ground group");
            this.isOnGround = false;
            cc.log("[DEBUG] Player is now OFF ground.");
        }
    }

    jump() {
        cc.log("[DEBUG] Attempting jump. isOnGround:", this.isOnGround, "rb:", !!this.rb);
        if (!this.isOnGround || !this.rb) return;
        this.isOnGround = false;
        this.isJumping = true;
        const jumpV = Math.sqrt(2 * Math.abs(cc.director.getPhysicsManager().gravity.y) * this.jumpHeight);
        cc.log("[DEBUG] Jump velocity set to:", jumpV);
        this.rb.linearVelocity = cc.v2(this.rb.linearVelocity.x, jumpV);
        cc.audioEngine.playEffect(this.jumpSound, false);
    }

    bounce() {
        if (this.rb) {
            this.rb.linearVelocity = cc.v2(this.rb.linearVelocity.x, 400);
        }
        // Optionally play bounce sound, add score, etc.
    }

    setAnimationState(name: string) {
        if (this.animation && this.animation.currentClip?.name !== name) {
            this.animation.play(name);
        }
    }

    updateAnimationState() {
        let animationName = "Default";
        if (this.isDead) {
            animationName = "Die";
        } else if (this.isJumping) {
            animationName = "Jump";
        } else if (this.direction.x !== 0) {
            animationName = "Move";
        }
        this.setAnimationState(animationName);
    }

    /**
     * Handles Player's death or damage.
     * @param reason "fall" for falling off the map, "enemy" for enemy contact
     */
    handleDeath(reason: string = "unknown") {
        if (this.isDead) return;
        this.isDead = true;
        this.direction.x = 0;
        this.removeKeyboardListeners();

        if (this.deathSound) {
            cc.audioEngine.playEffect(this.deathSound, false);
        }

        if (this.physicsCollider) {
            this.physicsCollider.sensor = true;
            this.physicsCollider.apply();
        }

        this.updateAnimationState();

        if (reason !== "fall" && this.rb) {
            // Apply an upward velocity for the death jump
            this.rb.linearVelocity = cc.v2(0, 400);
        }
    }

    updateCameraPosition() {
        if (this.cameraNode) {
            const winSize = cc.winSize;
            this.cameraNode.x = this.node.x - winSize.width / 2;
            this.cameraNode.y = this.node.y - winSize.height / 2;
        }
    }

    resetToStart() {
        if (this.rb) {
            this.rb.linearVelocity = cc.v2(0, 0);
        }
        this.node.setPosition(this.startPosition);
        this.resetState();
        this.addKeyboardListeners();
    }

    resetState() {
        this.isDead = false;
        this.isJumping = false;
        this.isOnGround = false;
        this.direction = cc.Vec2.ZERO.clone();
        this.invincible = false;

        if (this.physicsCollider) {
            this.physicsCollider.sensor = false;
            this.physicsCollider.apply();
        }

        this.setAnimationState("Idle");
    }

    onDestroy() {
        this.removeKeyboardListeners();
    }
}
