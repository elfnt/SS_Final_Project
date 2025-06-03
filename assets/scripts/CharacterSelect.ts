const { ccclass, property } = cc._decorator;

const characterNames = ["mario", "chick1", "chick2", "chick3"];
@ccclass
export default class CharacterSelect extends cc.Component {
    @property([cc.Node])
    characterCards: cc.Node[] = [];

    @property(cc.Button)
    confirmButton: cc.Button = null;

    private selectedIndex: number = 0;

    onLoad() {
        // 預設選中最左邊的角色
        this.updateSelection();

        // 監聽鍵盤事件
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        if (this.confirmButton) {
            this.confirmButton.node.on('click', this.confirmSelection, this);
        } 
    }

    onDestroy() {
        // 清除監聽（避免切場景後還殘留）
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    onKeyDown(event: cc.Event.EventKeyboard) {
        cc.log("key down:", event.keyCode);
        if (event.keyCode === cc.macro.KEY.left) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.updateSelection();
        } else if (event.keyCode === cc.macro.KEY.right) {
            this.selectedIndex = Math.min(this.characterCards.length - 1, this.selectedIndex + 1);
            this.updateSelection();
        } else if (event.keyCode === cc.macro.KEY.enter || event.keyCode === cc.macro.KEY.z) {
            this.confirmSelection();
        }
    }

    updateSelection() {
        cc.log("Updating selection to index:", this.selectedIndex);
        this.characterCards.forEach((card, i) => {
            const mark = card.getChildByName("selection_frame");
            if (!mark) {
                cc.warn(`找不到 selection_frame in characterCards[${i}]`);
                return;
            }
            mark.active = (i === this.selectedIndex);
        });
    }

    confirmSelection() {
        const selectedName = characterNames[this.selectedIndex];
        cc.sys.localStorage.setItem("selectedCharacter", selectedName);
        cc.log("[選角] 儲存角色名：", selectedName);
        cc.director.loadScene("Lobby");
    }

}
