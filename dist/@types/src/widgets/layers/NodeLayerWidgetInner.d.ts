/// <reference types="react" />
import * as React from "react";
import { DiagramEngine } from "../../DiagramEngine";
export interface NLWIProps {
    diagramEngine: DiagramEngine;
}
export declare class NodeLayerWidgetInner extends React.Component<NLWIProps> {
    shouldComponentUpdate(nextProps: any): boolean;
    render(): JSX.Element;
}
