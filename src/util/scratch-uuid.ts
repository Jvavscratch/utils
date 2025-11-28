/*******************************************************************
* Copyright         : 2024 saaawdust
* File Name         : scratch-uuid.ts
* Description       : Generates a UUID
*                    
* Revision History  :
* Date		Author 			Comments
* ------------------------------------------------------------------
\n* 11/27/2025\tNeuronPulse\tModified\n* *
/******************************************************************/

export function uuid(Include: String, Length = 32) {
    let result = '';

    for (let i = 0; i < Length; i++) {
        const randomIndex = Math.floor(Math.random() * Include.length);
        result += Include.charAt(randomIndex);
    }

    return result;
}

export const includes = {
    scratch_alphanumeric: "0123456789abcdef",
    alphanumeric: "0123456789abcdefghijklmnopqrstuvwxyz",
    alphanumeric_with_symbols: "0123456789abcdefghijklmnopqrstuvwxyz`!拢$%^&*()_+"
}

