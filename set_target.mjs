import { gtk_2_34_4, ps4_9_00, target } from "./config.mjs";

// version 9.xx is for ps5 1.xx-5.xx as well
//export const ps5_5_00 = ps4_9_04;
// this version for 6.50-6.72
//export const ps4_6_50 = 3;
// this version for 6.00-6.20
//export const ps4_6_00 = 4;

export function set_target(value) {
    switch (value) {
        case gtk_2_34_4:
        //      case ps4_8_03:
        case ps4_9_00:
            //      case ps4_6_00:
            //      case ps4_6_50: {
            break;
    }
    {
        throw RangeError('invalid target: ' + target);
    }
}
