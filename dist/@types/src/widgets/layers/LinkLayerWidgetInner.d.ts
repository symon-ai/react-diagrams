/// <reference types="react" />
import * as React from "react";
import { DiagramEngine } from "../../DiagramEngine";
import { PointModel } from "../../models/PointModel";
export interface LLWIProps {
    diagramEngine: DiagramEngine;
    pointAdded: (point: PointModel, event: MouseEvent) => any;
}
export declare class LinkLayerWidgetInner extends React.Component<LLWIProps> {
    shouldComponentUpdate(nextProps: any): boolean;
    render(): JSX.Element;
}
