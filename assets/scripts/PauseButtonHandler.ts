const { ccclass, property } = cc._decorator;

@ccclass
export default class PauseButtonHandler extends cc.Component {
    @property(cc.Node) gameManager: cc.Node = null;

    onPauseClicked() {
        this.gameManager.getComponent("GameManager").pauseGame();
    }
}