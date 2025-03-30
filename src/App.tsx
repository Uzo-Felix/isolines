import React, { useState, useEffect } from "react";
import IsolineChart from "./components/IsoLineChart";
import Conrec from "./utils/conrec";
interface Segment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const App: React.FC = () => {
  const [isolines, setIsolines] = useState<Segment[][]>([]);

  useEffect(() => {
    const mslpData = [ [100430, 100440, 100450, 100460, 100470, 100480],
    [100435, 100445, 100455, 100465, 100475, 100485],
    [100440, 100450, 100460, 100470, 100480, 100490],
    [100445, 100455, 100465, 100475, 100485, 100495],
    [100450, 100460, 100470, 100480, 100490, 100500],
    [100455, 100465, 100475, 100485, 100495, 100505],
    [100460, 100470, 100480, 100490, 100500, 100510],
    [100465, 100475, 100485, 100495, 100505, 100515],
    [100470, 100480, 100490, 100500, 100510, 100520],
    [100475, 100485, 100495, 100505, 100515, 100525],
    [100480, 100490, 100500, 100510, 100520, 100530]
];

    // Define the contour levels
    const levels = [100450, 100460, 100470, 100480, 100490, 100500];
    const conrec = new Conrec(mslpData, levels);
    setIsolines(conrec.generateIsolines());
  }, []);

  return (
    <div>
      <h2>Isoline Visualization</h2>
      <IsolineChart isolines={isolines} />
    </div>
  );
};
export default App;
