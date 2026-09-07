import { DynamicBorder, getSelectListTheme, type Theme } from '@earendil-works/pi-coding-agent';
import {
  Container,
  type Focusable,
  fuzzyFilter,
  getKeybindings,
  Input,
  matchesKey,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
} from '@earendil-works/pi-tui';
import { formatKeybindingText } from '@trethore/shared/ui/keybindings.js';

export class AccountSelector extends Container implements Focusable {
  private readonly searchInput = new Input();
  private selectList: SelectList;
  private readonly listIndex: number;

  get focused(): boolean {
    return this.searchInput.focused;
  }

  set focused(value: boolean) {
    this.searchInput.focused = value;
  }

  constructor(
    private readonly items: SelectItem[],
    currentProvider: string | undefined,
    theme: Theme,
    private readonly done: (value?: string) => void,
    private readonly setDefault?: (provider: string) => void
  ) {
    super();
    this.addChild(new DynamicBorder());
    this.addChild(new Spacer(1));
    this.addChild(new Text('Provider Accounts', 0, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.searchInput);
    this.addChild(new Spacer(1));
    this.selectList = this.buildList(items, currentProvider);
    this.listIndex = this.children.length;
    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    const confirm = formatKeybindingText('tui.select.confirm');
    const cancel = formatKeybindingText('tui.select.cancel');
    this.addChild(
      new Text(theme.fg('dim', `  ${confirm} to select | ${cancel} to cancel | ctrl+s to set startup default`), 0, 0)
    );
    this.addChild(new DynamicBorder());
    this.searchInput.onSubmit = () => {
      this.selectList.handleInput('\r');
    };
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'ctrl+s')) {
      const selected = this.selectList.getSelectedItem();
      if (selected && selected.value !== 'add') this.setDefault?.(selected.value);
      return;
    }
    const keys = getKeybindings();
    const navigation = [
      'tui.select.up',
      'tui.select.down',
      'tui.select.pageUp',
      'tui.select.pageDown',
      'tui.select.confirm',
      'tui.select.cancel',
    ] as const;
    if (navigation.some((key) => keys.matches(data, key))) {
      this.selectList.handleInput(data);
      return;
    }
    this.searchInput.handleInput(data);
    const query = this.searchInput.getValue();
    const filtered = fuzzyFilter(this.items, query, (item) => `${item.label} ${item.description ?? ''}`);
    this.selectList = this.buildList(filtered, this.selectList.getSelectedItem()?.value);
    this.children[this.listIndex] = this.selectList;
  }

  private buildList(items: SelectItem[], selected: string | undefined): SelectList {
    const list = new SelectList(items, Math.max(1, Math.min(items.length, 10)), getSelectListTheme(), {
      minPrimaryColumnWidth: 12,
      maxPrimaryColumnWidth: 52,
    });
    const index = items.findIndex((item) => item.value === selected);
    if (index !== -1) list.setSelectedIndex(index);
    list.onSelect = (item) => {
      this.done(item.value);
    };
    list.onCancel = () => {
      this.done();
    };
    return list;
  }
}
