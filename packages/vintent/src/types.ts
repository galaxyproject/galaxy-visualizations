import { Component } from "vue";

export interface ConsoleMessageType {
    content: string;
    details?: any;
    icon?: Component;
    spin?: boolean;
    type?: string;
}
