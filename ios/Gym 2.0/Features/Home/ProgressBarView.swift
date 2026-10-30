//
//  ProgressBarView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI

struct ProgressBarView: View {
    
    let percentage: Int
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {
        
        HStack {
            RoundedRectangle(cornerRadius: 20)
                .stroke(lineWidth: 4)
                .frame(height: 10)
                .frame(maxWidth: .infinity)
                .foregroundStyle(Color("MyBlack"))
                .background(alignment: .leading, content: {
                    GeometryReader {proxy in
                        RoundedRectangle(cornerRadius: 20)
                            .fill(userSettings.appColor)
                            .frame(height: 10)
                            .frame(width: proxy.size.width * (CGFloat(percentage)/100))
                    }
                })

            Text("\(percentage)%")
                .padding(.horizontal, 10)
        }
        .padding(.leading, 10)
            
        
    }
}
