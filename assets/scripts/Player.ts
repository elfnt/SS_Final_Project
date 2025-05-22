const { ccclass, property } = cc._decorator;

@ccclass
export default class Player extends cc.Component {

    @property({ tooltip: "水平移動速度 (px/s)" })
    moveSpeed: number = 300;

    @property({ tooltip: "跳躍初速度 (px/s)" })
    jumpForce: number = 1500;

    // Remove animation properties, use animation names directly
    private lastAnim: string = '';

    private rb: cc.RigidBody = null;           // 剛體
    private collider: cc.PhysicsBoxCollider = null; // 主碰撞框 (拿高度用)
    private moveDir: number = 0;               // -1 左、0 停、1 右
    private isGrounded: boolean = false;       // 是否著地
    private lastMoveDir: number = 0;

    /* ---------------------- 初始化 ---------------------- */
    onLoad() {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp, this);
        cc.director.getPhysicsManager().enabled = true;


        // Debug: print all colliders in the scene
        const all = cc.director.getScene().getComponentsInChildren(cc.PhysicsBoxCollider);
        cc.log('[DEBUG] All PhysicsBoxColliders in scene:');
        all.forEach(c => cc.log(`  ${c.node.name}, group: ${c.node.group}, enabled: ${c.enabled}`));

        // Debug: print if physics manager is enabled
        const phys = cc.director.getPhysicsManager();
        cc.log('[DEBUG] PhysicsManager enabled:', phys.enabled);
    }

    start() {
        this.rb       = this.getComponent(cc.RigidBody);
        this.collider = this.getComponent(cc.PhysicsBoxCollider);

        /* 讓停止更乾脆：阻尼 + 鎖 Y 旋轉 */
        this.rb.linearDamping = 8;       // 大於 5 幾乎不殘留水平慣性
        this.rb.fixedRotation = true;
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp, this);
    }

    // Cocos Creator 2.x will call these automatically if present
    private onBeginContact(contact, self, other) {
        cc.log('[DEBUG] onBeginContact called with', other.node.name, 'group:', other.node.group);
        if (other.node.group === 'Ground') {
            const worldManifold = contact.getWorldManifold();
            this.isGrounded = true;
            cc.log('[DEBUG] onBeginContact: Grounded!');

        }
    }

    private onEndContact(contact, self, other) {
        cc.log('[DEBUG] onEndContact called with', other.node.name, 'group:', other.node.group);
        if (other.node.group === 'Ground') {
            this.isGrounded = false;
            cc.log('[DEBUG] onEndContact: Not grounded');
        }
    }

    /* ---------------------- 每禎更新 ---------------------- */
    update(dt: number) {
        /* 1️⃣ 水平立即加速／停止 */
        const vel = this.rb.linearVelocity;
        vel.x = this.moveDir * this.moveSpeed;
        this.rb.linearVelocity = vel;

        const wasGrounded = this.isGrounded;

        // Debug: print raycast and grounded info
        if (wasGrounded !== this.isGrounded) {
            cc.log(`[DEBUG] isGrounded changed: ${wasGrounded} -> ${this.isGrounded}`);
        }
        cc.log(`[DEBUG] moveDir=${this.moveDir}, vel=(${vel.x.toFixed(2)},${vel.y.toFixed(2)}), isGrounded=${this.isGrounded}`);

        // Animation logic using animation names
        const anim = this.node.getComponent(cc.Animation);
        if (!this.isGrounded && Math.abs(vel.y) > 10) {
            if (this.lastAnim !== 'Jump' && anim) {
                anim.play('Jump');
                this.lastAnim = 'Jump';
            }
        } else if (this.isGrounded && this.moveDir !== 0) {
            if (this.lastAnim !== 'Move' && anim) {
                anim.play('Move');
                this.lastAnim = 'Move';
            }
        } else if (this.isGrounded && this.moveDir === 0) {
            if (this.lastAnim !== 'Default' && anim) {
                anim.play('Default');
                this.lastAnim = 'Default';
            }
        }

        // Flip sprite when changing direction
        if (this.moveDir !== 0) {
            this.node.scaleX = this.moveDir > 0 ? Math.abs(this.node.scaleX) : -Math.abs(this.node.scaleX);
        }

        // Fix: Reset jump if just landed
        if (!wasGrounded && this.isGrounded) {
            cc.log('[DEBUG] Landed!');
        }
        /* DEBUG ▶️ 每禎顯示一次腳底狀態（可選） */
        // console.log(`[Player] grounded=${this.isGrounded}`);
    }

    /* ---------------------- 鍵盤 ---------------------- */
    onKeyDown(event: cc.Event.EventKeyboard) {
        switch (event.keyCode) {
            case cc.macro.KEY.a:  this.moveDir = -1; break;
            case cc.macro.KEY.d:  this.moveDir =  1; break;
            case cc.macro.KEY.space:
                if (this.isGrounded) {
                    const vel = this.rb.linearVelocity;
                    vel.y = this.jumpForce;
                    this.rb.linearVelocity = vel;
                }
                break;
        }
    }

    onKeyUp(event: cc.Event.EventKeyboard) {
        if ((event.keyCode === cc.macro.KEY.a && this.moveDir === -1) ||
            (event.keyCode === cc.macro.KEY.d && this.moveDir ===  1)) {
            this.moveDir = 0;                        // 立即停止
        }
    }
    
}