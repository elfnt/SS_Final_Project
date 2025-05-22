const { ccclass, property } = cc._decorator;

@ccclass
export default class Player extends cc.Component {

    @property({ tooltip: "水平移動速度 (px/s)" })
    moveSpeed: number = 300;

    @property({ tooltip: "跳躍初速度 (px/s)" })
    jumpForce: number = 1500;

    private rb: cc.RigidBody = null;           // 剛體
    private collider: cc.PhysicsBoxCollider = null; // 主碰撞框 (拿高度用)
    private moveDir: number = 0;               // -1 左、0 停、1 右
    private isGrounded: boolean = false;       // 是否著地

    /* ---------------------- 初始化 ---------------------- */
    onLoad() {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
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
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }

    /* ---------------------- 每禎更新 ---------------------- */
    update(dt: number) {
        /* 1️⃣ 水平立即加速／停止 */
        const vel = this.rb.linearVelocity;
        vel.x = this.moveDir * this.moveSpeed;
        this.rb.linearVelocity = vel;

        /* 2️⃣ 用 RayCast 檢查腳下地面 */
        this.checkGrounded();

        /* DEBUG ▶️ 每禎顯示一次腳底狀態（可選） */
        // console.log(`[Player] grounded=${this.isGrounded}`);
    }

    /* ---------------------- 鍵盤 ---------------------- */
    onKeyDown(event: cc.Event.EventKeyboard) {
        switch (event.keyCode) {
            case cc.macro.KEY.a:  this.moveDir = -1; break;
            case cc.macro.KEY.d:  this.moveDir =  1; break;
            case cc.macro.KEY.space:
                console.log(`[Player] ␣ pressed, grounded=${this.isGrounded}`);
                if (this.isGrounded) {
                    const vel = this.rb.linearVelocity;
                    vel.y = this.jumpForce;
                    this.rb.linearVelocity = vel;
                    console.log(`[Player] 🚀 Jump! vy=${vel.y}`);
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

    /* ---------------------- 地面偵測 ---------------------- */
    private checkGrounded() {
        const phys = cc.director.getPhysicsManager();
    
        /* 1️⃣ 起點往「腳底上方 2px」的位置 */
        const start = this.node.convertToWorldSpaceAR(
            cc.v2(0, -this.collider.size.height * 0.5 + 2)
        );
        /* 2️⃣ 往下射 6px（保守一點） */
        const end   = cc.v2(start.x, start.y - 6);
    
        /* 3️⃣ 取所有命中 → 過濾掉自己的 Collider */
        const hits = phys.rayCast(start, end, cc.RayCastType.All)
                         .filter(hit => hit.collider !== this.collider);
    
        const was = this.isGrounded;
        this.isGrounded = hits.length > 0;
    
        if (was !== this.isGrounded) {
            console.log(`[Player] Grounded ⇢ ${this.isGrounded} (hits=${hits.length})`);
            /* （可選）看看打到誰 */
            hits.forEach(h => console.log(`  ↳ hit ${h.collider.node.name}`));
        }
    }
    
}
