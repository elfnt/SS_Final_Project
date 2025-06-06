import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Door extends cc.Component {
    @property({ tooltip: "Firebase 蛋 ID" })
    eggId: string = "egg1";

    @property({ tooltip: "感應頻率（秒）" })
    checkInterval: number = 0.3;

    private triggered: boolean = false;

    onLoad() {
        this.schedule(this.checkEggOverlap, this.checkInterval);
    }

    // ✅ 方法一：物理碰撞觸發
    onBeginContact(contact, selfCollider, otherCollider) {
        if (this.triggered) return;

        const isEgg = otherCollider.node.name === "Egg";
        if (isEgg) {
            cc.log("[Door] 💥 本地端碰到蛋 → 切場景");
            this.triggerSceneChange();
        }
    }

    // ✅ 方法二：Firebase 位置同步觸發
    private checkEggOverlap() {
        if (this.triggered) return;

        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) return;

        firebase.database.ref(`eggs/${this.eggId}/position`).once("value", (snapshot) => {
            const pos = snapshot.val();
            if (!pos) return;

            const eggPos = cc.v2(pos.x, pos.y);
            const doorPos = this.node.getPosition();
            const size = this.node.getContentSize();
            const scale = this.node.scale;

            // ✅ 計算縮放後的範圍
            const halfWidth = (size.width * scale) / 2;
            const halfHeight = (size.height * scale) / 2;

            const dx = Math.abs(eggPos.x - doorPos.x);
            const dy = Math.abs(eggPos.y - doorPos.y);
            const inRange = dx <= halfWidth && dy <= halfHeight;

            cc.log(`[Door] 🔍 檢查 Firebase 蛋位置 dx=${dx}, dy=${dy}, 門感應範圍=(${halfWidth}, ${halfHeight}), inRange=${inRange}`);

            if (inRange) {
                cc.log("[Door] 📡 Firebase 偵測蛋進入門 → 切場景");
                this.triggerSceneChange();
            }
        });
    }

    // ✅ 切換場景，只觸發一次
    private triggerSceneChange() {
        if (this.triggered) return;
        this.triggered = true;

        cc.log("[Door] ✅ 觸發切換 → 銷毀所有玩家與蛋");

        // 🔥 銷毀蛋
        const eggNode = cc.find("Canvas/Egg");
        if (eggNode) eggNode.destroy();



        // 🔄 延遲切場景
        this.scheduleOnce(() => {
            cc.director.loadScene("EndScene2");
        }, 0.1);
    }

}