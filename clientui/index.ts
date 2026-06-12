/**
 * clientui bundle entry, registers all apps and exposes the shell on
 * window.ClientUI. The HTML template calls ClientUI.bootstrap() on load;
 * smoke tests call it with explicit options.
 */
import "./apps";
import { bootstrap } from "./bootstrap";

const ClientUI = { bootstrap };

declare global {
  interface Window {
    ClientUI: typeof ClientUI;
  }
}

window.ClientUI = ClientUI;

export { bootstrap };
