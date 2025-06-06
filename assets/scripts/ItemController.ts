import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class ItemController extends cc.Component {
    @property({ tooltip: "Firebase 上的 item ID（每個物品唯一）" })
    itemId: string = "box1";

    private initialPosition: cc.Vec2 = null;
    private lastSentPos: cc.Vec2 = null;

    onLoad() {
        this.initialPosition = this.node.getPosition().clone();
        this.initBoxInFirebase();
        this.listenToFirebase();
    }    

    update(dt: number) {
        // 只有「地上可推動」時同步座標
        if (!this.node.active) return;
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;

        // 可加 active=true 條件強化嚴謹性
        db.ref(`boxes/${this.itemId}`).once("value", (snapshot) => {
            const box = snapshot.val();
            if (!box || box.active !== true) return;

            const curPos = this.node.getPosition();
            if (
                !this.lastSentPos ||
                Math.abs(curPos.x - this.lastSentPos.x) > 1e-2 ||    // 用小數比較
                Math.abs(curPos.y - this.lastSentPos.y) > 1e-2
            ) {
                db.ref(`boxes/${this.itemId}/position`).set({
                    x: curPos.x,
                    y: curPos.y
                });
                this.lastSentPos = curPos.clone();
            }
        });
    }

    // 初始化該物件的 Firebase 狀態（只會執行一次）
    private initBoxInFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        db.ref(`boxes/${this.itemId}`).once("value", (snapshot) => {
            if (!snapshot.exists()) {
                db.ref(`boxes/${this.itemId}`).set({
                    active: true,
                    position: { x: this.initialPosition.x, y: this.initialPosition.y }
                });
                cc.log(`[ItemController] 初始化 ${this.itemId} 到 Firebase`);
            }
        });
    }

    // 監聽該物件的狀態，任何人撿起/丟下都會即時同步
    private listenToFirebase() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;

        db.ref(`boxes/${this.itemId}`).on("value", (snapshot) => {
            const box = snapshot.val();
            cc.log(`[ItemController] ${this.itemId} 狀態：`, box);

            if (!box || box.active === false) {
                // 消失（被撿起或資料不存在）
                this.node.active = false;
                return;
            }
            // 顯示在地上
            this.node.active = true;
            if (box.position) {
                this.node.setPosition(box.position.x, box.position.y);
            }
            // 若你需要特效，也可以在這裡加
        });
    }

    // （可選）關卡重設或需要時恢復初始狀態
    public resetToInitial() {
        const db = FirebaseManager.getInstance()?.database;
        if (!db) return;
        db.ref(`boxes/${this.itemId}`).set({
            active: true,
            position: { x: this.initialPosition.x, y: this.initialPosition.y }
        });
        this.node.active = true;
        this.node.setPosition(this.initialPosition.x, this.initialPosition.y);
    }
}
