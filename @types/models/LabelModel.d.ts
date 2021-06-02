import { BaseModel } from "./BaseModel";
import { LinkModel } from "./LinkModel";
export declare class LabelModel extends BaseModel<LinkModel> {
    offsetX: number;
    offsetY: number;
    constructor(type?: string, id?: string);
}
