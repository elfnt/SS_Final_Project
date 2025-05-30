const { ccclass, property } = cc._decorator;

@ccclass
export default class MainMenu extends cc.Component {
    @property(cc.Node)
    startButton: cc.Node = null;

    @property(cc.Node)
    settingButton: cc.Node = null;

    @property(cc.Node)
    characterButton: cc.Node = null;

    onLoad () {
        this.startButton.on('click', this.onStartGame, this);
        this.settingButton.on('click', this.onClickOpenSettings, this);
        this.characterButton.on('click', this.onCharacterSelect, this); // 👈 綁定事件
    }

    onStartGame () {
        cc.director.loadScene('Login');
    }

    onClickOpenSettings() {
        cc.director.loadScene("Setting");
    }

    onCharacterSelect () {
        cc.director.loadScene('CharacterSelect'); // 👈 切換到角色選擇場景
    }

}
