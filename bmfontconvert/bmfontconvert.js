var settings = {
	space: 1,
	name: "",
	lineSpace: 1,
	charSpace: 1,
	maxWidth: 255,
	spaceWidth: "",
	lineHeight: "",
	forecolor: 0,
	backcolor: -1,
	baselineX: 2,
	baselineY: 11,
	gridWidth: 16,
	gridHeight: 16,
	outfile: "",
	format: "XML"
}
var outfile;

/**
 * Validates JSON input. Will also populate settings if possible.
 */
function checkJSON() {
	console.log("!");
	var inp = document.getElementById("json").value;
	try {
		var data = JSON.parse(inp);
	} catch (err) {
		//alert("Error parsing JSON input: ",err);
		document.getElementById("jsonStatus").innerHTML = "<span class='jsonBad'>JSON invalid</span>";
		console.log(err,inp);
		return false;
	}
	document.getElementById("jsonStatus").innerHTML = "<span class='jsonGood'>JSON OK</span>";
	getSettings();
	if(settings.name=="") document.getElementById("name").value = data.name;
	if(settings.charSpace=="") document.getElementById("charSpace").value = data.letterspace/64|0;
	getSettings();
	console.log(data);
	return data;
}

/**
 * Retrieves settings from input.
 */
function getSettings() {
	for(var i in Object.keys(settings)) {
		var k = Object.keys(settings)[i];
		if(document.getElementById(k)) {
			settings[k] = document.getElementById(k).value;
		}
	}
}

/**
 * Decodes a given character. The format used by BitFontMaker2 is that each item in the array
 * is encoded in some funky bitwise way. 
 */
function decodeCharacter(char) {
	let max_x = -1;
	let min_x = -1;
	let max_y = -1;
	let min_y = -1;
	let p = [];
	for (let y = 0; y < settings.gridHeight; y++) {
		if (!p[y]) p[y] = [];
		for (let x = 0; x < settings.gridWidth; x++) {
			p[y][x] = 0;
			if (char[y] & (1 << x)) { // converting from bitwise operator
				p[y][x] = 1;
				if (min_x == -1 || x < min_x) min_x = x;
				if (min_y == -1 || y < min_y) min_y = y;
				if (max_x == -1 || x > max_x) max_x = x;
				if (max_y == -1 || y > max_y) max_y = y;
			}
		}
	}
	if (min_x !== -1) {
		let height = max_y - min_y + 1;
		let width = max_x - min_x + 1;
		let xoffset = -(min_x - +settings.baselineX);
		let yoffset = max_y - +settings.baselineY;
		let xadvance = width + +settings.charSpace - xoffset;
		return {
			p: p, //will be a pixel grid where 0 = empty and 1 = filled
			min_x: min_x,
			max_x: max_x,
			min_y: min_y,
			max_y: max_y,
			height: height,
			width: width,
			xoffset: -xoffset,
			yoffset: yoffset,
			xadvance: xadvance
		};
	}
	//failed for some reason
	return false;
}

/**
 * Does the actual conversion work of JSON to PNG and XML.
 */
function process() {
	data  = checkJSON();
	if(!data) {
		alert("Could not convert font: JSON is invalid.");
		return;
	}

	//keeps track of how high above or below baseline we go
	let max_above_baseline = 0;
	let max_below_baseline = 0;

	//keep track of whether we have an actual space (32) character -- if not, we will infer one
	settings.have_space = false;

	// holds characters as array and index
	let chars = [];
	let charIdx = {};

	for(var i in Object.keys(data)) {
		var k = Object.keys(data)[i];
		if (!isNaN(Number(k))) {
			var c = decodeCharacter(data[k]);
			if(c) {
				c.chr = k;
				chars.push(c);
				charIdx[k] = chars.length-1;
				if (c.height - c.yoffset > max_above_baseline) max_above_baseline = c.height - c.yoffset;
				if (Math.abs(c.yoffset) > max_below_baseline) max_below_baseline = Math.abs(c.yoffset);
				if (c.chr == 32 && (typeof settings.spaceWidth === 'undefined' || settings.spaceWidth=="")) {
					settings.spaceWidth = +c.width;
					settings.have_space = true;
				}
				if (c.chr == 65) a_height = c.height; //height of the capital letter A
				if (!settings.have_space && (typeof settings.spaceWidth === 'undefined'||settings.spaceWidth=="") && [105, 108, 49].includes(c.chr)) settings.spaceWidth = +c.width;
			}
		}
	};
	// Check for space width if not explcitly defined
	if(settings.spaceWidth=="" || settings.spaceWidth=="undefined") {
		if(charIdx[32]) { // " "
			settings.spaceWidth = +chars[charIdx[32]].width;
			settings.have_space = true;
		} else if(charIdx[105]) {  //"i"
			settings.spaceWidth = +chars[charIdx[105]].width;
		} else if(charIdx[108]) { // "l"
			settings.spaceWidth = +chars[charIdx[108]].width;
		} else if(charIdx[49]) { // "1"
			settings.spaceWidth = +chars[charIdx[49]].width;
		} else { //default
			settings.spaceWidth = 3; 
		}
	}


	//deduce lineHeight	
	if(typeof settings.lineHeight == "undefined" || settings.lineHeight=="") {
		var a_height = undefined;
		for(var i = 65; i<=90;i++) {
			if(a_height==undefined && charIdx[i]) a_height = +chars[charIdx[i]].height;
		}
		if(a_height==undefined) {
			for(var i = 48; i<=57;i++) {
				if(a_height==undefined && charIdx[i]) a_height = +chars[charIdx[i]].height;
			}
		}
		if(a_height==undefined) a_height = (+max_above_baseline);
		settings.lineHeight = a_height+max_below_baseline-1;
	}

	// Sort by height and then character (for png)
	chars.sort((a, b) => {
		if(a.height > b.height) {
			return -1;
		} else if (a.height<b.height) {
			return 1;
		} else if (a.chr>b.chr) {
			return 1;
		} else {
			return -1;
		}
	});

	// calculate dimensions and locations for PNG
	let cur_x = 1;
	let cur_y = 0;
	let line_height = 0;
	let max_height = 0;
	let max_width = 0;

	chars.forEach((char, k) => {
		if (cur_x + (+settings.space) + char.width > (+settings.maxWidth)) {
			cur_x = 0;
			cur_y += line_height + (+settings.space);
			line_height = char.height;
		}
		if (char.height > line_height) line_height = +char.height;
		chars[k].output_x = (+cur_x);
		chars[k].output_y = (+cur_y);
		// recalculate true yoffset
		chars[k].yoffset = (max_above_baseline - char.height) + char.yoffset - 1;

		cur_x += +settings.space + +char.width;
		if (cur_x > max_width) max_width = cur_x;
		if (cur_y + line_height + +settings.lineSpace > max_height) max_height = cur_y + line_height + +settings.lineSpace;
	});

	settings.max_above_baseline = max_above_baseline;

	outfile = settings.outfile?settings.outfile:settings.name.replaceAll(" ","_").replaceAll(".","_");

	if(settings.format=="XML") {
		var fnt = make_xml(chars);
	} else if(settings.format=="JSON") {
		var fnt = make_json(chars);
	}
	document.getElementById("fnt").innerHTML = fnt;	
	settings.max_width = max_width;
	settings.max_height = max_height;

	var img = make_img(chars);

	document.getElementById("download_png").disabled = false;
	document.getElementById("download_fnt").disabled = false;
	document.getElementById("download_png").innerHTML = "Download PNG file ("+outfile+".png)";
	document.getElementById("download_fnt").innerHTML = "Download FNT file ("+outfile+".fnt)";

}

/**
 * Generates XML from character data.
 * 
 * XML file format is described here: https://www.angelcode.com/products/bmfont/doc/file_format.html
 */
function make_xml(chars) {
	chars.sort((a,b)=>{ return a.chr<b.chr?-1:1})	
	var out = `<?xml version="1.0"?>
<font>
	<info face="${settings.name}" size="${settings.max_above_baseline}" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="1,1" outline="0"/>
	<common lineHeight="${+settings.lineHeight}" base="${settings.max_above_baseline}" scaleW="256" scaleH="256" pages="1" packed="0" alphaChnl="0" redChnl="3" greenChnl="3" blueChnl="3"/>
	<pages>
		<page id="0" file="${outfile}.png" />
	</pages>
	<chars count="${chars.length}">
`;
	if(settings.spaceWidth!=undefined && settings.spaceWidth!="") {
		out+=`\t\t<char id="32" x="0" y="0" width="1" height="1" xoffset="0" yoffset="${settings.max_above_baseline}" xadvance="${+settings.spaceWidth+1}" page="0" chnl="15" />\n`;
	}
	for(i in chars) {
		var char = chars[i];
		out+=`\t\t<char id="${char["chr"]}" x="${char["output_x"]}" y="${char["output_y"]}" width="${char["width"]}" height="${char["height"]}" xoffset="${char["xoffset"]}" yoffset="${char["yoffset"]}" xadvance="${char["xadvance"]}" page="0" chnl="15" />\n`;
	}
	out+=`\t</chars>\n</font>`;
	return out;
}

/**
 * Creates a JSON output from the characters.
 * Not used.
 */
function make_json(chars) {
	chars.sort((a,b)=>{ return a.chr<b.chr?-1:1})	
	var out = {
		font: {
			info: {
				face: settings.name,
				size: settings.max_above_baseline,
				bold: 0,
				italic: 0,
				charset: "",
				unicode: 1,
				stretchH: 100,
				smooth: 0,
				aa: 1,
				padding: [0,0,0,0],
				spacing: [1,1],
				outline: 0,
			},
			common: {
				lineHeight: settings.lineHeight,
				base: 10,
				scaleW: 256,
				scaleH: 256,
				pages: 1,
				packed: 0,
				alphaChnl: 0,
				redChnl: 3,
				greenChnl: 3,
				blueChnl: 3,
			},
			pages: {
				page: {
					id: 0,
					file: outfile+".png"
				}
			},
			chars: {
				count: chars.length,
				char: []
			}
		}
	}
	if(settings.have_space) {
		out.font.chars.push({
			id: 32,
			x: 0,
			y: 0,
			width: 1,
			height: 1,
			xoffset: 0,
			yoffset: settings.max_above_baseline,
			xadvance: settings.spaceWidth+1,
			yadvance: 0,
			page: 0,
			chnl: 15
		})
	}
	for(var i in chars) {
		var char = chars[i];
		out.font.chars.char.push({
			id: char["chr"],
			x: char["output_x"],
			y: char["output_y"],
			width: char["width"],
			height: char["height"],
			xoffset: char["xoffset"],
			yoffset: char["yoffset"],
			xadvance: char["xadvance"],
			yadvance: char["yadvance"],
			page: 0,
			chnl: 15
		})
	}
	return JSON.stringify(out,undefined,"\t");
}


/**
 * Uses the Canvas renderer to draw the image.
 */
function make_img(chars) {
	const canvas = document.createElement('canvas');
	canvas.width = settings.max_width;
	canvas.height = settings.max_height;
	canvas.id = "canvas";
	const ctx = canvas.getContext("2d");
	if(settings.backcolor!=-1) {
		ctx.fillStyle = settings.backcolor;
		ctx.fillRect(0,0,settings.max_width,settings.max_height);
	}
	ctx.fillStyle = settings.forecolor;

	for(var i in chars) {
		var char = chars[i];
		for(var x = char["min_x"]; x<=char["max_x"]; x++) {
			for(y = char["min_y"]; y<=char["max_y"]; y++) {
				if(char["p"][y][x]) {
					ctx.fillRect(char["output_x"]+x-char["min_x"],char["output_y"]+y-char["min_y"],1,1);
				}
			}
		}
	}
	document.getElementById("img").innerHTML = "";
	document.getElementById("img").append(canvas);
	document.getElementById("img").style.display = "block";
}

/**
 * Downloads the .fnt file.
 */
function download_fnt() {
	download(outfile+".fnt","data:text/plain;charset=utf-8,"+encodeURIComponent(document.getElementById("fnt").value));
}

/**
 * Downloads the .png file.
 */
function download_png() {
	const canvas = document.getElementById("canvas");
	const img =  canvas.toDataURL('image/png');
	download(outfile+".png",img);
}


/**
 * Function that tries to force the browser to download file data. May or may not work on your browser.
 */
function download(filename, data) {
  var element = document.createElement('a');
	  element.setAttribute('href', data);
	  element.setAttribute('download', filename);
  	element.style.display = 'none';
  	document.body.appendChild(element);
	  element.click();
	  document.body.removeChild(element);
}