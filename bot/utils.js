const { inlineCode } = require('discord.js');

// truncate a string to set length, using ellipsis in the center
function truncate(s, length=44) {
    length = length < 5? 5 : length;                // should not truncate anything shorter than 5 characters
    const trunc = s.length > length ? `${s.substring(0, Math.ceil(length/2) - 1)}…${s.substring(s.length - Math.floor(length/2))}` : s;
    return trunc
}

// take a pretty name and an id and combine; if no name provided, just return id
function prettify_node(name, id, maxlen = 44, codify = true) {
    if (!name) return codify ? inlineCode(id) : id;     // just return id if no name is given
    const MAX_LEN = maxlen - 3;                         // arbitrary, can be increased
    const MAX_NAME_LEN = Math.ceil(MAX_LEN / 2);        // name shouldn't be much longer than half the max length
    const name_new = truncate(name, MAX_NAME_LEN);
    const MAX_ID_LEN = MAX_LEN - name_new.length;       // id takes up the rest of the space
    const pretty = `${name_new} / ${truncate(id, MAX_ID_LEN)}`;
    return codify? inlineCode(pretty) : pretty;
}

module.exports = { prettify_node };