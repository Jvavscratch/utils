/*******************************************************************
* Copyright         : 2024 saaawdust
* File Name         : evaluate.ts
* Description       : Evaluates a type
*                    
* Revision History  :
* Date		Author 			Comments
* ------------------------------------------------------------------
\n* 11/27/2025\tNeuronPulse\tModified\n* *
/******************************************************************/


import { existsSync } from "fs"
import { BlockCluster } from "./blocks"
import { buildData, typeData } from "./types"
// import { error } from "../cli/jvavscratchProject" // 鏇挎崲涓鸿嚜瀹氫箟閿欒澶勭悊
const error = console.error;
import { join } from "path";

export function evaluate(type: string, blockCluster: BlockCluster, instance: any, id: string, buildData: buildData): typeData
{
    let data: any;
    let s = false;
    let packageData = buildData.packages;
    for (let i = 0; i < packageData.type_implements.length; i++) {
        if (packageData.type_implements[i].name == type) {
            data = packageData.type_implements[i].body;
            s = true;
            break;
        }
    }

    let path = `../generator/types/${type}.ts`;
    if (!existsSync(join(__dirname, path)) && !s)
    {
        error("[internal] attempt to load non-existant type: " + type);
    } else if (!s)
    {
        data = require(join(__dirname, path));
    };

    return data(blockCluster, instance, id, buildData)
}


