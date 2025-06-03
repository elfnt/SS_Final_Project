// Other-Player.ts
const { ccclass, property } = cc._decorator;

interface PlayerState {
    name: string;
    x: number;
    y: number;
    animation?: string;
    facing?: number;
    online?: boolean;
    position?: { x: number; y: number }; // Support for nested position
    character?: string;
}

@ccclass
export default class RemotePlayer extends cc.Component {

    @property(cc.Label)
    nameLabel: cc.Label = null;

    @property(cc.Sprite)
    playerSprite: cc.Sprite = null;

    @property({tooltip: "If true, create a label if not assigned in editor"})
    createLabelIfMissing: boolean = true;

    @property
    nameOffsetY: number = 60; // Match with your local player offset

    @property
    nameFontSize: number = 15; // Match with your local player font size

    @property(cc.Color)
    nameLabelColor: cc.Color = cc.Color.WHITE;

    @property([cc.AnimationClip]) characterDefaultClips: cc.AnimationClip[] = [];
    @property([cc.AnimationClip]) characterMoveClips: cc.AnimationClip[] = [];
    @property([cc.AnimationClip]) characterJumpClips: cc.AnimationClip[] = [];
    @property([cc.SpriteFrame]) characterSprites: cc.SpriteFrame[] = [];

    private playerId: string = "";
    private anim: cc.Animation = null;

    private targetPosition: cc.Vec2 = null;
    @property({type: cc.Float, tooltip: "Speed for position interpolation"})
    lerpSpeed: number = 10;

    private isFirstUpdate: boolean = true;

    onLoad() {
        this.anim = this.getComponent(cc.Animation);
        this.targetPosition = cc.v2(this.node.x, this.node.y); // Use cc.v2 for consistency

        if (!this.nameLabel && this.createLabelIfMissing) {
            this.createNameLabel();
        }

        // Ensure the node is visible
        this.node.opacity = 255;
        if (this.playerSprite) {
            this.playerSprite.enabled = true;
        }
        
        cc.log(`[RemotePlayer] ${this.node.name} onLoad completed.`);
    }

    createNameLabel() {
        const labelNode = new cc.Node("NameLabel_Remote"); // Ensure unique name if creating dynamically
        
        const label = labelNode.addComponent(cc.Label);
        
        label.string = "Player"; // Default text
        label.fontSize = this.nameFontSize;
        label.lineHeight = this.nameFontSize + 2; // Adjust for better spacing
        label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        label.verticalAlign = cc.Label.VerticalAlign.CENTER;
        labelNode.color = this.nameLabelColor;
        
        const outline = labelNode.addComponent(cc.LabelOutline);
        outline.color = cc.Color.BLACK;
        outline.width = 1; // Slightly thinner outline might look cleaner
        
        labelNode.y = this.nameOffsetY;
        
        // Set initial scale to be non-mirrored. It will be adjusted by updateNameLabel.
        labelNode.setScale(1, 1);
        
        labelNode.zIndex = 10; // Ensure it's drawn on top
        labelNode.parent = this.node;
        
        this.nameLabel = label;
        
        cc.log(`[RemotePlayer] Created name label for player ${this.playerId}`);
    }

    /**
     * Adjusts the name label's scale to counteract parent mirroring.
     * Ensures the label always reads left-to-right.
     */
    private updateNameLabelScale() {
        if (!this.nameLabel || !this.nameLabel.node) return;
        
        const labelNode = this.nameLabel.node;
        
        // Set Y position (if it could change, otherwise set in createNameLabel is enough)
        labelNode.y = this.nameOffsetY;

        // To prevent the label from mirroring with the parent node:
        // If parent.scaleX is -1, label's local scaleX should be -1 to appear normal in world space.
        // If parent.scaleX is 1, label's local scaleX should be 1.
        const parentScaleXSign = Math.sign(this.node.scaleX || 1); // Use || 1 to avoid Math.sign(0) which is 0
        
        // Assuming the label's "natural" un-flipped local scaleX magnitude is 1.
        // If your label has a different base scale (e.g., you set it to 0.5 in the editor),
        // you'd use Math.abs(initialLocalScaleX) instead of 1 here.
        labelNode.scaleX = parentScaleXSign * 1; // Or parentScaleXSign * Math.abs(initialXScaleOfLabel);

        // Keep Y scale positive (or its intended default, e.g., 1)
        // labelNode.scaleY = 1; // Or Math.abs(initialYScaleOfLabel);
        // If scaleY should always be 1 (or some other positive constant):
        if (labelNode.scaleY < 0) { // Only flip if it somehow became negative
            labelNode.scaleY = Math.abs(labelNode.scaleY);
        } else if (labelNode.scaleY === 0) { // Ensure it's not zero
            labelNode.scaleY = 1;
        }
        // Or simply: labelNode.scaleY = 1; // if it should always be 1
    }

    public initialize(id: string, initialState: PlayerState) {
        cc.log(`[RemotePlayer] Initializing player ${id} with data:`, initialState);
        this.playerId = id;
        this.node.name = `RemotePlayer_${id}`; // Corrected template literal
        
        if (!initialState) {
            cc.error(`[RemotePlayer] Initial state for ${id} is null or undefined!`);
            return;
        }
        
        if (!this.nameLabel && this.createLabelIfMissing) {
            this.createNameLabel();
        }

        if (this.nameLabel && initialState.name) {
            this.nameLabel.string = initialState.name;
        }
        
        this.isFirstUpdate = true;
        this.updateState(initialState); 
        // Ensure scale is correct after initial state potentially sets facing direction
        this.updateNameLabelScale(); 
        cc.log(`[RemotePlayer] ${id} initialized at (${this.node.x.toFixed(2)}, ${this.node.y.toFixed(2)}). Name: ${initialState.name}`);
    }

    public updateState(newState: PlayerState) {
        if (!newState) {
            cc.warn(`[RemotePlayer] updateState called with null/undefined newState for ${this.playerId}`);
            return;
        }

        if (!this.nameLabel && this.createLabelIfMissing && newState.name) {
            this.createNameLabel(); // Create if still missing and name is provided
        }

        if (this.nameLabel) {
            const nameToShow = newState.name || `P_${this.playerId.substring(0, 4)}`;
            if (this.nameLabel.string !== nameToShow) {
                this.nameLabel.string = nameToShow;
            }
        }

        if (typeof newState.x === 'number' && typeof newState.y === 'number') {
            this.targetPosition.x = newState.x;
            this.targetPosition.y = newState.y;
        } else if (newState.position && typeof newState.position.x === 'number' && typeof newState.position.y === 'number') {
            this.targetPosition.x = newState.position.x;
            this.targetPosition.y = newState.position.y;
        }

        if (this.isFirstUpdate && this.targetPosition) { // Snap to position on first update
            this.node.setPosition(this.targetPosition);
            this.isFirstUpdate = false;
            cc.log(`[RemotePlayer] ${this.playerId} snapped to initial remote position: (${this.node.x.toFixed(2)}, ${this.node.y.toFixed(2)})`);
        }

        if (typeof newState.facing === 'number' && this.node.scaleX * newState.facing < 0) { // Only update if different
            this.node.scaleX = Math.abs(this.node.scaleX) * newState.facing;
        }
        this.updateNameLabelScale(); // Always update label scale after potential parent scale change

        const characterMap = {
            mario: 0,
            chick1: 1,
            chick2: 2,
            chick3: 3
        };

        if (newState.character) {
            const index = characterMap[newState.character] ?? 0;

            const scaleMap = [4, 4, 4, 4];
            this.node.setScale(scaleMap[index], scaleMap[index]);

            if (this.characterSprites[index] && this.playerSprite) {
                this.playerSprite.spriteFrame = this.characterSprites[index];
                (this.playerSprite as any)._refreshAssembler?.();
            }

            if (this.anim) {
                this.anim.stop();
                this.anim.addClip(this.characterDefaultClips[index], "Default");
                this.anim.addClip(this.characterMoveClips[index], "Move");
                this.anim.addClip(this.characterJumpClips[index], "Jump");
                this.anim.defaultClip = this.characterDefaultClips[index];
                this.anim.play(newState.animation || "Default");
            }

            cc.log(`[RemotePlayer] 套用了角色外觀：${newState.character} (index=${index})`);
        }


        if (this.anim && newState.animation) {
            const currentName = this.anim.currentClip ? this.anim.currentClip.name : null;
            if (currentName !== newState.animation || !this.anim.getAnimationState(newState.animation)?.isPlaying) {
                this.anim.play(newState.animation);
            }
        }
        
        this.node.opacity = 255;
        if (this.playerSprite) this.playerSprite.enabled = true;
        
        if (this.nameLabel && this.nameLabel.node) {
            this.nameLabel.node.opacity = 255;
            // updateNameLabelScale handles its scale
        }
    }

    update(dt: number) {
        if (this.targetPosition) {
            const currentPosVec3 = this.node.position;
            const targetPosVec3 = new cc.Vec3(this.targetPosition.x, this.targetPosition.y, currentPosVec3.z);
            this.node.position = currentPosVec3.lerp(targetPosVec3, dt * this.lerpSpeed);
        }
        
        // Continuously ensure the label scale counteracts parent's scaleX
        this.updateNameLabelScale();
    }

    onDestroy() {
        cc.log(`[RemotePlayer] Node for ${this.playerId} being destroyed.`);
    }
}