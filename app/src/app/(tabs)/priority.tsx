// Priority: on wide screens, a shortcut in the rail, indented under List (like Sleep Journal's
// Dreams and Sheet under Stats). It's the List, opened on the Priority category instead of All.
// Phones don't show it: there, Priority is in the List's Category picker.
import { ListView } from './index';

export default function PriorityScreen() {
  return <ListView start="upnext" />;
}
