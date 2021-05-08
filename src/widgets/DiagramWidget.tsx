import * as _ from "lodash";
import * as React from "react";
import { BaseAction } from "../actions/BaseAction";
import { MoveCanvasAction } from "../actions/MoveCanvasAction";
import { MoveItemsAction } from "../actions/MoveItemsAction";
import { SelectingAction } from "../actions/SelectingAction";
import { BaseEntity } from "../BaseEntity";
import { DiagramEngine } from "../DiagramEngine";
import { BaseModel, BaseModelListener } from "../models/BaseModel";
import { LinkModel } from "../models/LinkModel";
import { NodeModel } from "../models/NodeModel";
import { PointModel } from "../models/PointModel";
import { PortModel } from "../models/PortModel";
import { Toolkit } from "../Toolkit";
import { BaseWidget, BaseWidgetProps } from "./BaseWidget";
import { LinkLayerWidget } from "./layers/LinkLayerWidget";
import { NodeLayerWidget } from "./layers/NodeLayerWidget";

export interface DiagramProps extends BaseWidgetProps {
	diagramEngine: DiagramEngine;

	allowLooseLinks?: boolean;
	allowCanvasTranslation?: boolean;
	allowCanvasZoom?: boolean;
	inverseZoom?: boolean;
	maxNumberPointsPerLink?: number;
	smartRouting?: boolean;
	disableNodeMove?: boolean;

	actionStartedFiring?: (action: BaseAction) => boolean;
	actionStillFiring?: (action: BaseAction) => void;
	actionStoppedFiring?: (action: BaseAction) => void;

	deleteKeys?: number[];

	onMoveStart?: (action: MoveItemsAction) => void;
	onMovingSingle?: (action: MoveItemsAction) => void;
	onMovingSingle2?: (action: MoveItemsAction) => void;
	onMoveFinished?: (action: MoveItemsAction, nodeLink?: any) => void;
	blockDelete?: boolean;
}

export interface DiagramState {
	action: BaseAction | null;
	wasMoved: boolean;
	renderedNodes: boolean;
	windowListener: any;
	diagramEngineListener: any;
	document: any;
}

/**
 * @author Dylan Vorster
 */
export class DiagramWidget extends BaseWidget<DiagramProps, DiagramState> {
	public static defaultProps: DiagramProps = {
		diagramEngine: null,
		allowLooseLinks: true,
		allowCanvasTranslation: true,
		allowCanvasZoom: true,
		inverseZoom: false,
		maxNumberPointsPerLink: Infinity, // backwards compatible default
		smartRouting: false,
		deleteKeys: [46, 8],
	};

	onKeyUpPointer: (this: Window, ev: KeyboardEvent) => void = null;

	constructor(props: DiagramProps) {
		super("srd-diagram", props);
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseUp = this.onMouseUp.bind(this);
		this.state = {
			action: null,
			wasMoved: false,
			renderedNodes: false,
			windowListener: null,
			diagramEngineListener: null,
			document: null,
		};
	}

	componentWillUnmount() {
		this.props.diagramEngine.removeListener(
			this.state.diagramEngineListener
		);
		this.props.diagramEngine.setCanvas(null);
		window.removeEventListener("keyup", this.onKeyUpPointer);
		window.removeEventListener("mouseUp", this.onMouseUp);
		window.removeEventListener("mouseMove", this.onMouseMove);
	}

	componentWillReceiveProps(nextProps: DiagramProps) {
		if (this.props.diagramEngine !== nextProps.diagramEngine) {
			this.props.diagramEngine.removeListener(
				this.state.diagramEngineListener
			);
			const diagramEngineListener = nextProps.diagramEngine.addListener({
				repaintCanvas: () => this.forceUpdate(),
			});
			this.setState({ diagramEngineListener });
		}
	}

	componentWillUpdate(nextProps: DiagramProps) {
		if (
			this.props.diagramEngine.diagramModel.id !==
			nextProps.diagramEngine.diagramModel.id
		) {
			this.setState({ renderedNodes: false });
			nextProps.diagramEngine.diagramModel.rendered = true;
		}
		if (!nextProps.diagramEngine.diagramModel.rendered) {
			this.setState({ renderedNodes: false });
			nextProps.diagramEngine.diagramModel.rendered = true;
		}
	}

	componentDidUpdate() {
		if (!this.state.renderedNodes) {
			this.setState({
				renderedNodes: true,
			});
		}
	}

	componentDidMount() {
		this.onKeyUpPointer = this.onKeyUp.bind(this);

		//add a keyboard listener
		this.setState({
			document: document,
			renderedNodes: true,
			diagramEngineListener: this.props.diagramEngine.addListener({
				repaintCanvas: () => {
					this.forceUpdate();
				},
			}),
		});

		window.addEventListener("keyup", this.onKeyUpPointer, false);

		// dont focus the window when in test mode - jsdom fails
		if (process.env.NODE_ENV !== "test") {
			window.focus();
		}
	}

	/**
	 * Gets a model and element under the mouse cursor
	 */
	getMouseElement(
		event
	): { model: BaseModel<BaseEntity, BaseModelListener>; element: Element } {
		var target = event.target as Element;
		var diagramModel = this.props.diagramEngine.diagramModel;

		//is it a port
		var element = Toolkit.closest(target, ".port[data-name]");
		if (element) {
			var nodeElement = Toolkit.closest(
				target,
				".node[data-nodeid]"
			) as HTMLElement;
			return {
				model: diagramModel
					.getNode(nodeElement.getAttribute("data-nodeid"))
					.getPort(element.getAttribute("data-name")),
				element: element,
			};
		}

		//look for a point
		element = Toolkit.closest(target, ".point[data-id]");
		if (element) {
			return {
				model: diagramModel
					.getLink(element.getAttribute("data-linkid"))
					.getPointModel(element.getAttribute("data-id")),
				element: element,
			};
		}

		//look for a link
		element = Toolkit.closest(target, "[data-linkid]");
		if (element) {
			return {
				model: diagramModel.getLink(
					element.getAttribute("data-linkid")
				),
				element: element,
			};
		}

		//look for a node
		element = Toolkit.closest(target, ".node[data-nodeid]");
		if (element) {
			return {
				model: diagramModel.getNode(
					element.getAttribute("data-nodeid")
				),
				element: element,
			};
		}

		return null;
	}

	fireAction() {
		if (this.state.action && this.props.actionStillFiring) {
			this.props.actionStillFiring(this.state.action);
		}
	}

	stopFiringAction(shouldSkipEvent?: boolean) {
		if (this.props.actionStoppedFiring && !shouldSkipEvent) {
			this.props.actionStoppedFiring(this.state.action);
		}
		this.setState({ action: null });
	}

	startFiringAction(action: BaseAction) {
		var setState = true;
		if (this.props.actionStartedFiring) {
			setState = this.props.actionStartedFiring(action);
		}
		if (setState) {
			this.setState({ action: action });
		}
	}

	onMouseMove(event) {
		var diagramEngine = this.props.diagramEngine;
		var diagramModel = diagramEngine.getDiagramModel();
		//select items so draw a bounding box
		if (this.state.action instanceof SelectingAction) {
			var relative = diagramEngine.getRelativePoint(
				event.clientX,
				event.clientY
			);

			_.forEach(diagramModel.getNodes(), (node) => {
				const isSelected = (this.state.action as SelectingAction).containsElement(
					node.x,
					node.y,
					diagramModel

				);
				if (isSelected !== node.selected) {
					node.setSelected(isSelected);
				}
			});

			_.forEach(diagramModel.getLinks(), (link) => {
				var allSelected = true;
				_.forEach(link.points, (point) => {
					const isSelected = (this.state.action as SelectingAction).containsElement(
						point.x,
						point.y,
						diagramModel
					);
					if (isSelected !== point.selected) {
						point.setSelected(isSelected);
					}
					if (!isSelected) {
						allSelected = false;
					}
				});

				if (allSelected) {
					link.setSelected(true);
				}
			});

			this.state.action.mouseX2 = relative.x;
			this.state.action.mouseY2 = relative.y;

			this.fireAction();
			this.setState({ action: this.state.action });
			return;
		} else if (
			this.state.action instanceof MoveItemsAction &&
			!this.props.disableNodeMove
		) {
			let amountX = event.clientX - this.state.action.mouseX;
			let amountY = event.clientY - this.state.action.mouseY;
			let amountZoom = diagramModel.getZoomLevel() / 100;

			_.forEach(this.state.action.selectionModels, (model) => {
				// in this case we need to also work out the relative grid position
				if (
					model.model instanceof NodeModel ||
					(model.model instanceof PointModel &&
						!model.model.isConnectedToPort())
				) {
					model.model.x = diagramModel.getGridPosition(
						model.initialX + amountX / amountZoom
					);
					model.model.y = diagramModel.getGridPosition(
						model.initialY + amountY / amountZoom
					);

					// update port coordinates as well
					if (model.model instanceof NodeModel) {
						_.forEach(model.model.getPorts(), (port) => {
							const portCoords = this.props.diagramEngine.getPortCoords(
								port
							);
							port.updateCoords(portCoords);
						});
					}

					if (diagramEngine.isSmartRoutingEnabled()) {
						diagramEngine.calculateRoutingMatrix();
					}
				} else if (model.model instanceof PointModel) {
					// we want points that are connected to ports, to not necessarily snap to grid
					// this stuff needs to be pixel perfect, dont touch it
					model.model.x =
						model.initialX +
						diagramModel.getGridPosition(amountX / amountZoom);
					model.model.y =
						model.initialY +
						diagramModel.getGridPosition(amountY / amountZoom);
				}
			});

			if (diagramEngine.isSmartRoutingEnabled()) {
				diagramEngine.calculateCanvasMatrix();
			}

			this.fireAction();
			if (this.props.onMovingSingle) {
				this.props.onMovingSingle(this.state.action);
			}
			if (this.props.onMovingSingle2) {
				this.props.onMovingSingle2(this.state.action);
			}
			if (!this.state.wasMoved) {
				this.setState({ wasMoved: true });
			} else {
				this.forceUpdate();
			}
		} else if (this.state.action instanceof MoveCanvasAction) {
			//translate the actual canvas
			if (this.props.allowCanvasTranslation) {
				diagramModel.setOffset(
					this.state.action.initialOffsetX +
						(event.clientX - this.state.action.mouseX),
					this.state.action.initialOffsetY +
						(event.clientY - this.state.action.mouseY)
				);
				diagramModel.setIsCanvasMoving(true);
				this.fireAction();
				this.forceUpdate();
			}
		}
	}

	onKeyUp(event) {
		// don't delete anything if an input field is focused
		if (
			(event.path && event.path[0].tagName === "INPUT") ||
			this.props.blockDelete
		) {
			return;
		}
		//delete all selected
		if (this.props.deleteKeys.indexOf(event.keyCode) !== -1) {
			_.forEach(
				this.props.diagramEngine.getDiagramModel().getSelectedItems(),
				(element) => {
					//only delete items which are not locked
					if (!this.props.diagramEngine.isModelLocked(element)) {
						element.remove();
					}
				}
			);
			this.forceUpdate();
		}
	}
	graphAlreadyHasLink(pointLink: LinkModel, diagramLinks, element): boolean {
		const links = pointLink.sourcePort.getLinks();
		if ((pointLink.sourcePort as any).in) {
			const keys = Object.keys(links);
			for (let i = 0; i < keys.length; i++) {
				const link = links[keys[i]];
				if (
					link.id !== pointLink.id &&
					link.targetPort &&
					link.sourcePort &&
					link.targetPort.id === pointLink.sourcePort.id &&
					link.sourcePort.id === element.model.id &&
					!!diagramLinks[link.id]
				) {
					return true;
				}
			}
		} else {
			const keys = Object.keys(links);
			for (let i = 0; i < keys.length; i++) {
				const link = links[keys[i]];
				if (
					link.id !== pointLink.id &&
					link.targetPort &&
					link.sourcePort &&
					link.sourcePort.id === pointLink.sourcePort.id &&
					link.targetPort.id === element.model.id &&
					!!diagramLinks[link.id]
				) {
					return true;
				}
			}
		}
		return false;
	}

	shouldAddLink(
		pointLink: LinkModel,
		srcPort: PortModel,
		tarPort: PortModel
	): boolean {
		if (srcPort.parent.id === tarPort.parent.id) {
			return false;
		}
		const links = pointLink.sourcePort.getLinks();
		if ((pointLink.sourcePort as any).in) {
			const keys = Object.keys(links);
			for (let i = 0; i < keys.length; i++) {
				const link = links[keys[i]];
				if (
					link.id !== pointLink.id &&
					link.targetPort &&
					link.sourcePort &&
					link.targetPort.id === srcPort.id &&
					link.sourcePort.id === tarPort.id
				) {
					return false;
				}
			}
		} else {
			const keys = Object.keys(links);
			for (let i = 0; i < keys.length; i++) {
				const link = links[keys[i]];
				if (
					link.id !== pointLink.id &&
					link.targetPort &&
					link.sourcePort &&
					link.sourcePort.id === srcPort.id &&
					link.targetPort.id === tarPort.id
				) {
					return false;
				}
			}
		}
		return true;
	}

	onMouseUp(event) {
		let nodeLink;
		var diagramEngine = this.props.diagramEngine;
		//are we going to connect a link to something?
		if (this.state.action instanceof MoveItemsAction) {
			var element = this.getMouseElement(event);
			_.forEach(this.state.action.selectionModels, (model) => {
				//only care about points connecting to things
				if (!(model.model instanceof PointModel)) {
					return;
				}
				const pointLink = model.model.getLink();
				const diagramLinks = diagramEngine.diagramModel.links;
				if (
					(this.state.action as MoveItemsAction).selectionModels
						.length === 1 &&
					element &&
					element.model &&
					(element.model as any).toolType
				) {
					const isData: boolean =
						(pointLink.sourcePort as any).portType !== "model";
					let matchingPortId: string | undefined;
					if ((pointLink.sourcePort as any).in) {
						const portKeys = Object.keys(
							(element.model as any).ports
						);
						for (let c = 0; c < portKeys.length; c++) {
							const k = portKeys[c];
							const port = (element.model as any).ports[k] as any;
							if (
								!port.in &&
								((port.portType === "model" && !isData) ||
									(port.portType !== "model" && isData))
							) {
								matchingPortId = k;
								if (Object.keys(port.links).length === 0) {
									break;
								}
							}
						}
						if (matchingPortId) {
							const matchPort = (element.model as any).ports[
								matchingPortId
							];
							if (
								this.shouldAddLink(
									pointLink,
									matchPort,
									pointLink.sourcePort
								)
							) {
								nodeLink = model.model.getLink().clone({});
								nodeLink.setSourcePort(matchPort);
								nodeLink.setTargetPort(pointLink.sourcePort);
								diagramEngine
									.getDiagramModel()
									.addLink(nodeLink);
							}
						}
					} else {
						const portKeys = Object.keys(
							(element.model as any).ports
						);
						for (let c = 0; c < portKeys.length; c++) {
							const k = portKeys[c];
							const port = (element.model as any).ports[k] as any;
							if (
								port.in &&
								((port.portType === "model" && !isData) ||
									(port.portType !== "model" && isData))
							) {
								matchingPortId = k;
								if (Object.keys(port.links).length === 0) {
									break;
								}
							}
						}
						if (matchingPortId) {
							const matchPort = (element.model as any).ports[
								matchingPortId
							];
							if (
								this.shouldAddLink(
									pointLink,
									pointLink.sourcePort,
									matchPort
								)
							) {
								nodeLink = model.model.getLink().clone({});
								nodeLink.setSourcePort(pointLink.sourcePort);
								nodeLink.setTargetPort(matchPort);
								diagramEngine
									.getDiagramModel()
									.addLink(nodeLink);
							}
						}
					}
				}
				if (
					!element ||
					(element.model &&
						element.model.parent &&
						element.model.parent.id ===
							pointLink.sourcePort.parent.id)
				) {
					const allModels = (this.state.action as any)
						.selectionModels;
					if (
						(allModels && allModels.length === 1) ||
						pointLink.getSourcePort() === null ||
						pointLink.getTargetPort() === null
					) {
						// dont allow to link the same node or links that end on things not in graph, like header
						pointLink.remove();
					} else if (
						(pointLink.getSourcePort() as any).in ===
						(pointLink.getTargetPort() as any).in
					) {
						// do not allow in to in or end to end
						pointLink.remove();
					}
					return;
				}
				if (pointLink.sourcePort) {
					const hasLinkAlready = this.graphAlreadyHasLink(
						pointLink,
						diagramLinks,
						element
					);
					if (hasLinkAlready) {
						pointLink.remove();
					}
					// const links = pointLink.sourcePort.getLinks();
					// if ((pointLink.sourcePort as any).in) {
					// 	const keys = Object.keys(links);
					// 	for (let i = 0; i < keys.length; i++) {
					// 		const link = links[keys[i]];
					// 		if (link.id !== pointLink.id && link.targetPort && link.sourcePort && link.targetPort.id === pointLink.sourcePort.id && link.sourcePort.id === element.model.id && !!diagramLinks[link.id]) {
					// 			pointLink.remove();
					// 			return;
					// 		}
					// 	}
					// } else {
					// 	const keys = Object.keys(links);
					// 	for (let i = 0; i < keys.length; i++) {
					// 		const link = links[keys[i]];
					// 		if (link.id !== pointLink.id && link.targetPort && link.sourcePort && link.sourcePort.id === pointLink.sourcePort.id && link.targetPort.id === element.model.id && !!diagramLinks[link.id]) {
					// 			pointLink.remove();
					// 			return;
					// 		}
					// 	}
					// }
				} else {
					throw new Error(
						"jsweetman-storm-react-diagrams point has not sourcePort or targetPort."
					);
				}
				if (
					element &&
					element.model instanceof PortModel &&
					!diagramEngine.isModelLocked(element.model)
				) {
					let link = model.model.getLink();
					if (link.getTargetPort() !== null) {
						// Jon: we don't want this weird feature
						//if this was a valid link already and we are adding a node in the middle, create 2 links from the original
						// if (link.getTargetPort() !== element.model && link.getSourcePort() !== element.model) {
						// 	const targetPort = link.getTargetPort();
						// 	let newLink = link.clone({});
						// 	newLink.setSourcePort(element.model);
						// 	newLink.setTargetPort(targetPort);
						// 	link.setTargetPort(element.model);
						// 	targetPort.removeLink(link);
						// 	newLink.removePointsBefore(newLink.getPoints()[link.getPointIndex(model.model)]);
						// 	link.removePointsAfter(model.model);
						// 	diagramEngine.getDiagramModel().addLink(newLink);
						// 	//if we are connecting to the same target or source, remove tweener points
						// } else if (link.getTargetPort() === element.model) {
						// 	link.removePointsAfter(model.model);
						// } else if (link.getSourcePort() === element.model) {
						// 	link.removePointsBefore(model.model);
						// }
					} else {
						link.setTargetPort(element.model);
					}
					delete this.props.diagramEngine
						.linksThatHaveInitiallyRendered[link.getID()];
				}
			});

			//check for / remove any loose links in any models which have been moved
			// Jon: Removed wasMoved, a scenario where wasMoved was false appeared if you clicked the edge of node to add, such link should be removed
			if (!this.props.allowLooseLinks) {
				// if (!this.props.allowLooseLinks && this.state.wasMoved) {

				_.forEach(this.state.action.selectionModels, (model) => {
					//only care about points connecting to things
					if (!(model.model instanceof PointModel)) {
						return;
					}

					let selectedPoint: PointModel = model.model;
					let link: LinkModel = selectedPoint.getLink();
					if (
						link.getSourcePort() === null ||
						link.getTargetPort() === null
					) {
						link.remove();
					}
				});
				// }
			}

			//remove any invalid links
			_.forEach(this.state.action.selectionModels, (model) => {
				//only care about points connecting to things
				if (!(model.model instanceof PointModel)) {
					return;
				}
				let link: LinkModel = model.model.getLink();
				let sourcePort: PortModel = link.getSourcePort();
				let targetPort: PortModel = link.getTargetPort();
				if (sourcePort !== null && targetPort !== null) {
					if ((sourcePort as any).in && !(targetPort as any).in) {
						const forwardLink = link.clone({});
						forwardLink.setSourcePort(targetPort);
						forwardLink.setTargetPort(sourcePort);
						diagramEngine.getDiagramModel().addLink(forwardLink);
						link.remove();
					} else if (
						(sourcePort as any).in === (targetPort as any).in
					) {
						// do not allow in to in or end to end
						link.remove();
					}
				}
				// Jon: This code doesn't seem to work
				// let link: LinkModel = model.model.getLink();
				// let sourcePort: PortModel = link.getSourcePort();
				// let targetPort: PortModel = link.getTargetPort();
				// if (sourcePort !== null && targetPort !== null) {
				// 	if (!sourcePort.canLinkToPort(targetPort)) {
				// 		//link not allowed
				// 		link.remove();
				// 	} else if (
				// 		_.some(
				// 			_.values(targetPort.getLinks()),
				// 			(l: LinkModel) =>
				// 				l !== link && (l.getSourcePort() === sourcePort || l.getTargetPort() === sourcePort)
				// 		)
				// 	) {
				// 		//link is a duplicate
				// 		link.remove();
				// 	}
				// }
			});
			if (this.props.onMoveFinished && this.state.wasMoved) {
				this.props.onMoveFinished(this.state.action, nodeLink);
			}

			diagramEngine.clearRepaintEntities();
			this.stopFiringAction(!this.state.wasMoved);
		} else {
			diagramEngine.clearRepaintEntities();
			diagramEngine.getDiagramModel().setIsCanvasMoving(false);
			this.stopFiringAction();
		}
		this.state.document.removeEventListener("mousemove", this.onMouseMove);
		this.state.document.removeEventListener("mouseup", this.onMouseUp);
	}

	drawSelectionBox() {
		let dimensions = (this.state
			.action as SelectingAction).getBoxDimensions();
		return (
			<div
				className={this.bem("__selector")}
				style={{
					top: dimensions.top,
					left: dimensions.left,
					width: dimensions.width,
					height: dimensions.height,
				}}
			/>
		);
	}

	render() {
		var diagramEngine = this.props.diagramEngine;
		diagramEngine.setMaxNumberPointsPerLink(
			this.props.maxNumberPointsPerLink
		);
		diagramEngine.setSmartRoutingStatus(this.props.smartRouting);
		var diagramModel = diagramEngine.getDiagramModel();

		return (
			<div
				{...this.getProps()}
				ref={(ref) => {
					if (ref) {
						this.props.diagramEngine.setCanvas(ref);
					}
				}}
				onWheel={(event) => {
					if (this.props.allowCanvasZoom) {
						event.stopPropagation();
						const oldZoomFactor = diagramModel.getZoomLevel() / 100;
						let scrollDelta = this.props.inverseZoom
							? -event.deltaY
							: event.deltaY;
						//check if it is pinch gesture
						if (event.ctrlKey && scrollDelta % 1 !== 0) {
							/*Chrome and Firefox sends wheel event with deltaY that
                have fractional part, also `ctrlKey` prop of the event is true
                though ctrl isn't pressed
              */
							scrollDelta /= 3;
						} else {
							scrollDelta /= 60;
						}
						if (diagramModel.getZoomLevel() + scrollDelta > 10) {
							diagramModel.setZoomLevel(
								diagramModel.getZoomLevel() + scrollDelta
							);
						}

						const zoomFactor = diagramModel.getZoomLevel() / 100;

						const boundingRect = event.currentTarget.getBoundingClientRect();
						const clientWidth = boundingRect.width;
						const clientHeight = boundingRect.height;
						// compute difference between rect before and after scroll
						const widthDiff =
							clientWidth * zoomFactor -
							clientWidth * oldZoomFactor;
						const heightDiff =
							clientHeight * zoomFactor -
							clientHeight * oldZoomFactor;
						// compute mouse coords relative to canvas
						const clientX = event.clientX - boundingRect.left;
						const clientY = event.clientY - boundingRect.top;

						// compute width and height increment factor
						const xFactor =
							(clientX - diagramModel.getOffsetX()) /
							oldZoomFactor /
							clientWidth;
						const yFactor =
							(clientY - diagramModel.getOffsetY()) /
							oldZoomFactor /
							clientHeight;

						diagramModel.setOffset(
							diagramModel.getOffsetX() - widthDiff * xFactor,
							diagramModel.getOffsetY() - heightDiff * yFactor
						);

						this.forceUpdate();
					}
				}}
				onMouseDown={(event) => {
					this.setState({ ...this.state, wasMoved: false });

					diagramEngine.clearRepaintEntities();
					var model = this.getMouseElement(event);
					//the canvas was selected
					if (model === null) {
						//is it a multiple selection
						if (event.shiftKey) {
							var relative = diagramEngine.getRelativePoint(
								event.clientX,
								event.clientY
							);
							this.startFiringAction(
								new SelectingAction(relative.x, relative.y)
							);
						} else {
							//its a drag the canvas event
							diagramModel.clearSelection();
							this.startFiringAction(
								new MoveCanvasAction(
									event.clientX,
									event.clientY,
									diagramModel
								)
							);
						}
					} else if (model.model instanceof PortModel) {
						//its a port element, we want to drag a link
						if (
							!this.props.diagramEngine.isModelLocked(model.model)
						) {
							var relative = diagramEngine.getRelativeMousePoint(
								event
							);
							var sourcePort = model.model;
							var link = sourcePort.createLinkModel();
							link.setSourcePort(sourcePort);

							if (link) {
								link.removeMiddlePoints();
								if (link.getSourcePort() !== sourcePort) {
									link.setSourcePort(sourcePort);
								}
								link.setTargetPort(null);

								link.getFirstPoint().updateLocation(relative);
								link.getLastPoint().updateLocation(relative);

								diagramModel.clearSelection();
								link.getLastPoint().setSelected(true);
								diagramModel.addLink(link);
								const moveAction = new MoveItemsAction(
									event.clientX,
									event.clientY,
									diagramEngine
								);
								if (this.props.onMoveStart) {
									this.props.onMoveStart(moveAction);
								}
								this.startFiringAction(moveAction);
							}
						} else {
							diagramModel.clearSelection();
						}
					} else {
						//its some or other element, probably want to move it
						if (!event.shiftKey && !model.model.isSelected()) {
							diagramModel.clearSelection();
						}

						if (event.shiftKey && model.model.isSelected()) {
							model.model.setSelected(false);
						} else {
							model.model.setSelected(true);
						}

						this.startFiringAction(
							new MoveItemsAction(
								event.clientX,
								event.clientY,
								diagramEngine
							)
						);
					}
					this.state.document.addEventListener(
						"mousemove",
						this.onMouseMove
					);
					this.state.document.addEventListener(
						"mouseup",
						this.onMouseUp
					);
				}}
			>
				{this.state.renderedNodes && (
					<LinkLayerWidget
						diagramEngine={diagramEngine}
						pointAdded={(point: PointModel, event) => {
							this.state.document.addEventListener(
								"mousemove",
								this.onMouseMove
							);
							this.state.document.addEventListener(
								"mouseup",
								this.onMouseUp
							);
							event.stopPropagation();
							diagramModel.clearSelection(point);
							this.setState({
								action: new MoveItemsAction(
									event.clientX,
									event.clientY,
									diagramEngine
								),
							});
						}}
					/>
				)}
				<NodeLayerWidget diagramEngine={diagramEngine} />
				{this.state.action instanceof SelectingAction &&
					this.drawSelectionBox()}
			</div>
		);
	}
}
