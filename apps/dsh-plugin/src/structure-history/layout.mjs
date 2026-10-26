/** View geometry only. Wrap wide sibling groups; never change saved parent/order data. */
export function treeLayout(nodes, width, zoom = 1) {
    const nodeWidth = 172 * zoom, nodeHeight = 60 * zoom, gap = 24 * zoom, step = nodeWidth + gap, inset = 24;
    const columns = Math.max(1, Math.floor((width - inset * 2 + gap) / step));
    const byId = new Map(nodes.map(n => [n.id, n])), children = new Map(), positions = new Map(), edges = [];
    for (const n of nodes) {
        const parent = byId.has(n.parentId) ? n.parentId : null;
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(n);
    }
    for (const group of children.values()) group.sort((a, b) => a.order - b.order);
    function groupLayout(group, left, top, capacity, parent) {
        const count = Math.min(capacity, group.length), span = Math.max(1, Math.floor(capacity / count));
        let bottom = top;
        for (let i = 0; i < group.length; i += count) {
            const row = group.slice(i, i + count), rowTop = bottom, used = row.length * span;
            const offset = left + (capacity - used) * step / 2;
            for (let j = 0; j < row.length; j++) {
                const n = row[j], childLeft = offset + j * span * step;
                const p = { id: n.id, x: childLeft + (span * step - gap - nodeWidth) / 2, y: rowTop, width: nodeWidth, height: nodeHeight };
                positions.set(n.id, p);
                if (parent) edges.push({ from: parent.id, to: n.id, lane: i ? left - gap / 2 : null, bus: rowTop - gap / 2 });
                const nested = children.get(n.id);
                bottom = Math.max(bottom, nested?.length ? groupLayout(nested, childLeft, rowTop + nodeHeight + gap * 2, span, p) : rowTop + nodeHeight + gap * 2);
            }
        }
        return bottom;
    }
    const canvasWidth = Math.max(width, columns * step - gap + inset * 2);
    const left = inset + (canvasWidth - (columns * step - gap + inset * 2)) / 2;
    const bottom = children.get(null)?.length ? groupLayout(children.get(null), left, inset, columns, null) : inset;
    return { positions, edges, width: canvasWidth, height: bottom + inset, nodeWidth, nodeHeight };
}

/** Search/filter keeps ancestors as context, including the old parents of removed nodes. */
export function visibleTree(after, changes, query = '', changedOnly = false) {
    const byId = new Map(after.nodes.map(n => [n.id, n]));
    for (const change of changes) if (!change.after) byId.set(change.id, change.before);
    // A partial current tree can refer to an unobserved old parent. Do not create
    // a cycle by joining that old node to its former, now moved child.
    for (const change of changes) if (!change.after) {
        let parent = byId.get(change.before.parentId);
        const visited = new Set([change.id]);
        while (parent && !visited.has(parent.id)) { visited.add(parent.id); parent = byId.get(parent.parentId); }
        if (parent) byId.set(change.id, { ...change.before, parentId: null });
    }
    const changed = new Set(changes.map(c => c.id)), matches = new Set(), included = new Set();
    const term = query.trim().toLocaleLowerCase();
    for (const n of byId.values()) {
        if ((!changedOnly || changed.has(n.id)) && (!term || `${n.title}\n${n.body}`.toLocaleLowerCase().includes(term))) {
            matches.add(n.id);
            let current = n;
            while (current && !included.has(current.id)) { included.add(current.id); current = byId.get(current.parentId); }
        }
    }
    return { nodes: [...byId.values()].filter(n => included.has(n.id)), matches };
}
