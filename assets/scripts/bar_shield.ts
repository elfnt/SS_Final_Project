import FirebaseManager from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class BarShieldListener extends cc.Component {

    @property({ tooltip: "Firebase 觸發節點 ID（例如 boxSensor1）" })
    triggerId: string = "boxSensor1";

    onLoad() {
        const firebase = FirebaseManager.getInstance();
        if (!firebase?.database) return;

        const ref = firebase.database.ref(`triggers/${this.triggerId}`);
        ref.on("value", (snapshot) => {
            const data = snapshot.val();
            if (data?.triggered) {
                this.activateShield();
            }
        });
    }

    activateShield() {
        this.node.opacity = 255;
        const rb = this.getComponent(cc.RigidBody);
        if (rb) {
            rb.type = cc.RigidBodyType.Dynamic;
            rb.awake = true;
        }

        cc.log("[BarShieldListener] 接收到 Firebase 觸發訊號，已轉為 dynamic");
    }
}
